namespace GameSrv.Services
{
    public class QueryPlayData
    {
        public int QueryId;
        public int QueryCount;
    }

    /// <summary>
    /// 玩家数据处理服务
    /// </summary>
    public static class PlayerDataService
    {

        private static readonly ConcurrentDictionary<int, ServerRequestData> QueryMap = new ConcurrentDictionary<int, ServerRequestData>();
        private static readonly ConcurrentQueue<QueryPlayData> QueryProcessList = new ConcurrentQueue<QueryPlayData>();
        private sealed class PendingSave
        {
            public SavePlayerRcd Record;
            public long SentAt;
            public bool ResultUnknown;
        }

        private const int SaveResponseTimeoutMilliseconds = 5000;
        private const int SaveRetryDelayMilliseconds = 1000;
        private const int MaximumSaveAttempts = 50;
        private static readonly object SaveGate = new object();
        private static readonly object QueryIdGate = new object();
        private static int LastIssuedQueryId;
        private static bool QueryIdsExhausted;
        private static readonly ConcurrentDictionary<int, PendingSave> PendingSaves = new ConcurrentDictionary<int, PendingSave>();
        private static readonly ConcurrentDictionary<int, byte> OutstandingQueries = new ConcurrentDictionary<int, byte>();
        private static readonly Dictionary<SavePlayerRcd, long> SaveRetryAt = new Dictionary<SavePlayerRcd, long>();
        private static Func<long> SaveClock = () => Environment.TickCount64;
        private static Func<int, ServerRequestMessage, SaveCharacterData, bool> SendSaveRequest =
            (queryId, message, packet) => GameShare.DataServer.SendRequest(queryId, message, packet);
        private static readonly ConcurrentDictionary<int, LoadPlayerDataPacket> LoadPlayDataMap = new ConcurrentDictionary<int, LoadPlayerDataPacket>();
        private static readonly object LoadGate = new object();
        private static readonly ConcurrentDictionary<int, byte> OutstandingLoads = new ConcurrentDictionary<int, byte>();

        public static int PendingLoadCount
        {
            get { lock (LoadGate) return Math.Max(OutstandingLoads.Count, QueryProcessList.Count + LoadPlayDataMap.Count); }
        }
        public static int PendingSaveCount { get { lock (SaveGate) return PendingSaves.Count; } }
        public static int UnknownSaveCount
        {
            get { lock (SaveGate) return PendingSaves.Values.Count(pending => pending.ResultUnknown); }
        }

        public static void Enqueue(int queryId, ServerRequestData data)
        {
            // A retired attempt cannot poison a retry, a later character or a load request.
            if (data == null || data.QueryId != queryId || !OutstandingQueries.ContainsKey(queryId))
                return;
            QueryMap.TryAdd(queryId, data);
            if (!OutstandingQueries.ContainsKey(queryId))
                QueryMap.TryRemove(queryId, out _);
            LogService.Debug($"执行任务Id:{queryId}成功");
        }

        private static bool GetDataSrvMessage(int queryId, ref int nIdent, ref int nRecog, ref byte[] data)
        {
            bool result = false;
            HUtil32.EnterCriticalSection(M2Share.UserDBCriticalSection);
            try
            {
                if (QueryMap.TryRemove(queryId, out ServerRequestData respPack))
                {
                    if (respPack == null)
                    {
                        return false;
                    }
                    ServerRequestMessage serverPacket = SerializerUtil.Deserialize<ServerRequestMessage>(EDCode.DecodeBuff(respPack.Message));
                    if (serverPacket == null)
                    {
                        return false;
                    }
                    nIdent = serverPacket.Ident;
                    nRecog = serverPacket.Recog;
                    data = respPack.Packet;
                    result = true;
                }
            }
            catch (Exception)
            {
                // Bad data cannot prevent processing replies belonging to other characters.
                LogService.Warn("DBSrv回复格式无效，保存结果仍未确认.");
            }
            finally
            {
                HUtil32.LeaveCriticalSection(M2Share.UserDBCriticalSection);
            }
            return result;
        }

        public static bool GetPlayData(int queryId, ref CharacterDataInfo playerData)
        {
            lock (LoadGate)
            {
                if (!OutstandingLoads.ContainsKey(queryId) ||
                    !LoadPlayDataMap.TryRemove(queryId, out LoadPlayerDataPacket loadPlayDataPacket)) return false;
                OutstandingLoads.TryRemove(queryId, out _);
                playerData = loadPlayDataPacket.HumDataInfo;
                return true;
            }
        }

        public static bool RetireLoad(int queryId)
        {
            lock (LoadGate)
            {
                // A world terminal branch can retire only this known load identity.
                // Save identities, other loads and their late replies remain untouched.
                if (queryId <= 0 || !OutstandingLoads.TryRemove(queryId, out _)) return false;
                RetireQuery(queryId);
                LoadPlayDataMap.TryRemove(queryId, out _);
                int count = QueryProcessList.Count;
                for (int i = 0; i < count && QueryProcessList.TryDequeue(out QueryPlayData queued); i++)
                    if (queued.QueryId != queryId) QueryProcessList.Enqueue(queued);
                return true;
            }
        }

        /// <summary>
        /// 查询角色数据
        /// </summary>
        public static bool QueryCharacterData(string account, string chrName, string addr, ref int queryId, int certCode)
        {
            bool result = false;
            LoadCharacterData loadHum = new LoadCharacterData()
            {
                Account = account,
                ChrName = chrName,
                UserAddr = addr,
                SessionID = certCode
            };
            if (LoadRcd(loadHum, ref queryId))
            {
                result = true;
            }
            SystemShare.Config.LoadDBCount++;
            return result;
        }

        /// <summary>
        /// 保存玩家数据到DB
        /// </summary>
        /// <returns></returns>
        public static bool SaveCharacterData(SavePlayerRcd saveRcd, ref int queryId)
        {
            lock (SaveGate)
            {
                if (saveRcd == null || saveRcd.IsSaveing || saveRcd.ReTryCount >= MaximumSaveAttempts)
                    return false;
                if (SaveRetryAt.TryGetValue(saveRcd, out long retryAt) && SaveClock() < retryAt)
                    return false;
                if (PendingSaves.Values.Any(pending => string.Equals(pending.Record.ChrName,
                    saveRcd.ChrName, StringComparison.OrdinalIgnoreCase)))
                    return false;
                SavePlayerRcd oldest = M2Share.FrontEngine.GetSaveRcdList().FirstOrDefault(record =>
                    record != null && string.Equals(record.ChrName, saveRcd.ChrName, StringComparison.OrdinalIgnoreCase));
                if (!ReferenceEquals(oldest, saveRcd) || !GameShare.DataServer.IsConnected)
                    return false;
                SystemShare.Config.SaveDBCount++;
                return SaveRcd(saveRcd, ref queryId);
            }
        }

        private static bool SaveRcd(SavePlayerRcd saveRcd, ref int queryId)
        {
            queryId = GetQueryId();
            if (queryId == 0)
                return false;
            saveRcd.QueryId = queryId;
            saveRcd.IsSaveing = true;
            saveRcd.ReTryCount++;
            PendingSave pending = new PendingSave { Record = saveRcd, SentAt = SaveClock() };
            PendingSaves.TryAdd(queryId, pending);
            ServerRequestMessage packet = new ServerRequestMessage(Messages.DB_SAVEHUMANRCD, saveRcd.SessionID, 0, 0, 0);
            SaveCharacterData saveHumData = new SaveCharacterData(saveRcd.Account, saveRcd.ChrName, saveRcd.CharacterData);
            try
            {
                if (SendSaveRequest(queryId, packet, saveHumData))
                    return true;
                // SendRequest=false means its pre-send Online check rejected the request.
                RejectSave(queryId, pending);
                return false;
            }
            catch (Exception)
            {
                // A transport exception may follow a partial send. Do not resend a snapshot
                // whose commit is unknown, even after reconnecting the DB connection.
                pending.ResultUnknown = true;
                LogService.Warn("DBSrv保存发送中断，结果未知，保留玩家保存记录.");
                return false;
            }
        }

        public static void ProcessSaveQueue()
        {
            lock (SaveGate)
            {
                foreach (KeyValuePair<int, PendingSave> entry in PendingSaves.ToArray())
                {
                    int queryId = entry.Key;
                    PendingSave pending = entry.Value;
                    if (!pending.Record.IsSaveing || pending.Record.QueryId != queryId)
                        continue;
                    int nIdent = 0;
                    int nRecog = 0;
                    byte[] data = null;
                    if (GetDataSrvMessage(queryId, ref nIdent, ref nRecog, ref data))
                    {
                        if (nIdent == Messages.DBR_SAVEHUMANRCD && nRecog == 1)
                        {
                            M2Share.FrontEngine.RemoveSaveList(queryId);
                            PendingSaves.TryRemove(queryId, out _);
                            SaveRetryAt.Remove(pending.Record);
                            RetireQuery(queryId);
                        }
                        else if (nIdent == Messages.DBR_LOADHUMANRCD && nRecog == 0)
                        {
                            // The original DBSrv save rejection deliberately uses LOAD/0.
                            RejectSave(queryId, pending);
                        }
                        else
                        {
                            pending.ResultUnknown = true;
                            LogService.Warn("DBSrv保存回复不匹配，保留玩家保存记录.");
                        }
                    }
                    else if (!pending.ResultUnknown && SaveClock() - pending.SentAt >= SaveResponseTimeoutMilliseconds)
                    {
                        pending.ResultUnknown = true;
                        LogService.Warn("DBSrv保存确认超时，结果未知，保留玩家保存记录.");
                    }
                }
            }
        }

        private static void RejectSave(int queryId, PendingSave pending)
        {
            PendingSaves.TryRemove(queryId, out _);
            RetireQuery(queryId);
            pending.Record.IsSaveing = false;
            pending.Record.QueryId = 0;
            SaveRetryAt[pending.Record] = SaveClock() + SaveRetryDelayMilliseconds;
        }

        private static void RetireQuery(int queryId)
        {
            OutstandingQueries.TryRemove(queryId, out _);
            QueryMap.TryRemove(queryId, out _);
        }

        public static void ProcessQueryQueue()
        {
            lock (LoadGate)
            {
                if (QueryProcessList.TryDequeue(out QueryPlayData queryData))
                {
                    if (!OutstandingLoads.ContainsKey(queryData.QueryId)) return;
                    if (queryData.QueryCount >= 60) //60秒后放弃
                    {
                        RetireQuery(queryData.QueryId);
                        OutstandingLoads.TryRemove(queryData.QueryId, out _);
                        LogService.Warn("超过最大查询次数,放弃此次保存.");
                        return;
                    }
                    int nIdent = 0;
                    int nRecog = 0;
                    byte[] data = null;
                    if (GetDataSrvMessage(queryData.QueryId, ref nIdent, ref nRecog, ref data))
                    {
                        if (nIdent == Messages.DBR_LOADHUMANRCD && nRecog == 1 && data.Length > 0)
                        {
                            LoadPlayerDataPacket responsePacket = SerializerUtil.Deserialize<LoadPlayerDataPacket>(EDCode.DecodeBuff(data));
                            responsePacket.ChrName = EDCode.DeCodeString(responsePacket.ChrName);
                            LoadPlayDataMap.TryAdd(queryData.QueryId, responsePacket);
                        }
                        else OutstandingLoads.TryRemove(queryData.QueryId, out _);
                        RetireQuery(queryData.QueryId);
                    }
                    else
                    {
                        queryData.QueryCount++;
                        QueryProcessList.Enqueue(queryData);
                    }
                }
            }
        }

        private static bool LoadRcd(LoadCharacterData loadHuman, ref int queryId)
        {
            queryId = GetQueryId();
            if (queryId == 0)
                return false;
            lock (LoadGate)
            {
                OutstandingLoads.TryAdd(queryId, 0);
                ServerRequestMessage packet = new ServerRequestMessage(Messages.DB_LOADHUMANRCD, 0, 0, 0, 0);
                if (GameShare.DataServer.SendRequest(queryId, packet, loadHuman))
                {
                    QueryProcessList.Enqueue(new QueryPlayData()
                    {
                        QueryId = queryId
                    });
                    LogService.Debug($"查询玩家数据任务ID:[{queryId}]");
                    return true;
                }
                LogService.Warn("DBSvr链接丢失，请确认DBSvr服务状态是否正常。");
                RetireLoad(queryId);
                return false;
            }
        }

        private static int GetQueryId()
        {
            lock (QueryIdGate)
            {
                int previous = Math.Max(LastIssuedQueryId, SystemShare.Config.DBQueryID);
                if (previous >= int.MaxValue - 1)
                {
                    if (!QueryIdsExhausted)
                        LogService.Warn("DBSrv查询编号已用尽，保留尚未确认的玩家保存记录.");
                    QueryIdsExhausted = true;
                    return 0;
                }
                int queryId = Math.Max(0, previous) + 1;
                LastIssuedQueryId = queryId;
                SystemShare.Config.DBQueryID = queryId;
                OutstandingQueries.TryAdd(queryId, 0);
                return queryId;
            }
        }
    }
}
