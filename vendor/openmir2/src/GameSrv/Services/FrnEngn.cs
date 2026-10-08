namespace GameSrv.Services
{
    public class FrontEngine : IFrontEngine
    {

        public readonly object UserCriticalSection;
        public readonly IList<SavePlayerRcd> m_SaveRcdList;
        private readonly IList<GoldChangeInfo> m_ChangeGoldList;
        public readonly IList<SavePlayerRcd> m_SaveRcdTempList;
        public IList<LoadDBInfo> m_LoadRcdTempList;
        public IList<LoadDBInfo> m_LoadRcdList;
        private int _shutdownRequested;

        public bool ShutdownRequested => Volatile.Read(ref _shutdownRequested) != 0;

        public void BeginShutdown()
        {
            // Admission linearizes at the atomic flag. AddToLoad checks it under
            // UserCriticalSection; an already admitted writer is drained normally.
            // Do not wait behind a snapshot serializer before closing admission.
            Interlocked.Exchange(ref _shutdownRequested, 1);
        }

        public int PendingLoadCount
        {
            get { lock (UserCriticalSection) return m_LoadRcdList.Count + m_LoadRcdTempList.Count; }
        }

        public int PendingGoldCount
        {
            get { lock (UserCriticalSection) return m_ChangeGoldList.Count; }
        }

        public FrontEngine()
        {
            UserCriticalSection = new object();
            m_LoadRcdList = new List<LoadDBInfo>();
            m_SaveRcdList = new List<SavePlayerRcd>();
            m_ChangeGoldList = new List<GoldChangeInfo>();
            m_LoadRcdTempList = new List<LoadDBInfo>();
            m_SaveRcdTempList = new List<SavePlayerRcd>();
        }

        public bool IsIdle()
        {
            bool result = false;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                if (m_SaveRcdList.Count == 0)
                {
                    result = true;
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            return result;
        }

        public int SaveListCount()
        {
            int result = 0;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                result = m_SaveRcdList.Count;
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            return result;
        }

        public void RemoveSaveList(int queryId)
        {
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                for (int j = 0; j < m_SaveRcdList.Count; j++)
                {
                    if (queryId > 0 && m_SaveRcdList[j].QueryId == queryId && m_SaveRcdList[j].IsSaveing)
                    {
                        SavePlayerRcd saved = m_SaveRcdList[j];
                        ProtocolTrace.Write("database save acknowledged; release pending record");
                        m_SaveRcdList.RemoveAt(j);
                        saved.IsSaveing = false;
                        if (saved.PlayObject != null)
                        {
                            saved.PlayObject.RcdSaved = !m_SaveRcdList.Any(pending =>
                                pending != null && string.Equals(pending.ChrName, saved.ChrName,
                                    StringComparison.OrdinalIgnoreCase));
                        }
                        break;
                    }
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
        }

        public void ProcessGameDate()
        {
            IList<GoldChangeInfo> changeGoldList = null;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                m_SaveRcdTempList.Clear();
                if (m_SaveRcdList.Any())
                {
                    for (int i = 0; i < m_SaveRcdList.Count; i++)
                    {
                        m_SaveRcdTempList.Add(m_SaveRcdList[i]);
                    }
                }
                IList<LoadDBInfo> TempList = m_LoadRcdTempList;
                m_LoadRcdTempList = m_LoadRcdList;
                m_LoadRcdList = TempList;
                if (m_ChangeGoldList.Any())
                {
                    changeGoldList = new List<GoldChangeInfo>();
                    for (int i = 0; i < m_ChangeGoldList.Count; i++)
                    {
                        changeGoldList.Add(m_ChangeGoldList[i]);
                    }
                    m_ChangeGoldList.Clear();
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            if (changeGoldList != null)
            {
                for (int i = 0; i < changeGoldList.Count; i++)
                {
                    GoldChangeInfo goldChangeInfo = changeGoldList[i];
                    if (goldChangeInfo.nGold <= 0)
                    {
                        continue;
                    }
                    if (!ChangeUserGoldInDB(goldChangeInfo) && ShutdownRequested)
                    {
                        // This legacy operation may fail (its DB implementation is currently
                        // absent). A shutdown drain must not convert that failure into idle.
                        lock (UserCriticalSection) m_ChangeGoldList.Add(goldChangeInfo);
                    }
                }
            }
        }

        public bool IsFull()
        {
            bool result = false;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                if (m_SaveRcdList.Count >= int.MaxValue)
                {
                    result = true;
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            return result;
        }

        public void AddToLoadRcdList(LoadDBInfo loadRcdInfo)
        {
            bool rejected;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                rejected = ShutdownRequested;
                if (!rejected) m_LoadRcdList.Add(loadRcdInfo);
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            if (rejected)
                M2Share.NetChannel.SendOutConnectMsg(loadRcdInfo.GateIdx, loadRcdInfo.SocketId, loadRcdInfo.GSocketIdx);
        }

        internal void RequeueExistingLoad(LoadDBInfo loadRcdInfo)
        {
            // Only the storage consumer uses this path for an already admitted load.
            // Closing admission must not discard a load waiting behind a save barrier.
            lock (UserCriticalSection) m_LoadRcdList.Add(loadRcdInfo);
        }

        /// <summary>
        /// 检查是否在保存队列中
        /// </summary>
        /// <param name="sChrName"></param>
        /// <returns></returns>
        public bool InSaveRcdList(string sChrName)
        {
            bool result = false;
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                for (int i = 0; i < m_SaveRcdList.Count; i++)
                {
                    if (string.Compare(m_SaveRcdList[i].ChrName, sChrName, StringComparison.OrdinalIgnoreCase) == 0)
                    {
                        result = true;
                        break;
                    }
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
            return result;
        }

        /// <summary>
        /// 添加到加载队列中
        /// </summary>
        public void AddChangeGoldList(string sGameMasterName, string sGetGoldUserName, int nGold)
        {
            GoldChangeInfo goldInfo = new GoldChangeInfo
            {
                sGameMasterName = sGameMasterName,
                sGetGoldUser = sGetGoldUserName,
                nGold = nGold
            };
            lock (UserCriticalSection)
                if (!ShutdownRequested) m_ChangeGoldList.Add(goldInfo);
        }

        /// <summary>
        /// 添加到保存队列中
        /// </summary>
        public void AddToSaveRcdList(SavePlayerRcd SaveRcd)
        {
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                if (SaveRcd == null)
                    throw new ArgumentNullException(nameof(SaveRcd));
                if (m_SaveRcdList.Contains(SaveRcd))
                    return;
                if (SaveRcd.PlayObject != null)
                    SaveRcd.PlayObject.RcdSaved = false;
                try
                {
                    // Actor arrays and item Desc buffers are shared by MakeSaveRcd. Freeze
                    // the actual wire snapshot while keeping only the actor completion link.
                    CharacterDataInfo frozen = SerializerUtil.Deserialize<CharacterDataInfo>(
                        SerializerUtil.Serialize(SaveRcd.CharacterData));
                    if (frozen == null)
                        throw new InvalidOperationException("Missing save snapshot.");
                    SaveRcd.CharacterData = frozen;
                }
                catch (Exception)
                {
                    // Keep the original record as a failed barrier. It has no native request
                    // identity and must never be sent or declared saved after a clone failure.
                    SaveRcd.IsSaveing = true;
                    SaveRcd.QueryId = 0;
                    LogService.Error("玩家保存快照冻结失败，保留记录并阻止重载.");
                }
                m_SaveRcdList.Add(SaveRcd);
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
        }

        public void DeleteHuman(int nGateIndex, int nSocket)
        {
            HUtil32.EnterCriticalSection(UserCriticalSection);
            try
            {
                for (int i = 0; i < m_LoadRcdList.Count; i++)
                {
                    LoadDBInfo loadRcdInfo = m_LoadRcdList[i];
                    if (loadRcdInfo.GateIdx == nGateIndex && loadRcdInfo.SocketId == nSocket)
                    {
                        m_LoadRcdList.RemoveAt(i);
                        break;
                    }
                }
            }
            finally
            {
                HUtil32.LeaveCriticalSection(UserCriticalSection);
            }
        }

        private static bool ChangeUserGoldInDB(GoldChangeInfo GoldChangeInfo)
        {
            bool result = false;
            /*if (PlayerDataService.LoadHumRcdFromDB("1", GoldChangeInfo.sGetGoldUser, "1", ref HumanRcd, 1))
            {
                if (HumanRcd.Data.Gold + GoldChangeInfo.nGold > 0 && HumanRcd.Data.Gold + GoldChangeInfo.nGold < 2000000000)
                {
                    HumanRcd.Data.Gold += GoldChangeInfo.nGold;
                    if (PlayerDataService.SaveHumRcdToDB("1", GoldChangeInfo.sGetGoldUser, 1, HumanRcd))
                    {
                        SystemShare.WorldEngine.sub_4AE514(GoldChangeInfo);
                        result = true;
                    }
                }
            }*/
            return result;
        }

        public IList<SavePlayerRcd> GetSaveRcdList()
        {
            lock (UserCriticalSection)
            {
                return m_SaveRcdList.ToArray();
            }
        }

        public void ClearSaveList()
        {
            lock (UserCriticalSection)
            {
                // Clearing unresolved snapshots would make IsIdle lie about a failed drain.
                if (m_SaveRcdList.Any(record => record != null))
                    LogService.Warn("拒绝清除尚未确认的玩家保存记录.");
                for (int index = m_SaveRcdList.Count - 1; index >= 0; index--)
                    if (m_SaveRcdList[index] == null)
                        m_SaveRcdList.RemoveAt(index);
            }
        }

        public IList<SavePlayerRcd> GetTempSaveRcdList()
        {
            lock (UserCriticalSection)
            {
                return m_SaveRcdTempList.ToArray();
            }
        }

        public void ClearLoadList()
        {
            m_LoadRcdTempList.Clear();
        }

        public IList<LoadDBInfo> GetLoadTempList()
        {
            return m_LoadRcdTempList;
        }

        public void ClearSaveRcdTempList()
        {
            lock (UserCriticalSection)
            {
                m_SaveRcdTempList.Clear();
            }
        }

        public void ClearLoadRcdTempList()
        {
            m_LoadRcdTempList.Clear();
        }
    }
}
