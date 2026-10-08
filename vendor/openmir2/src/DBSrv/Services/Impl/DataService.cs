using DBSrv.Conf;
using DBSrv.Storage;
using OpenMir2.DataHandlingAdapters;
using System.Collections.Concurrent;

namespace DBSrv.Services.Impl
{
    /// <summary>
    /// 玩家数据服务
    /// DBSrv->GameSvr
    /// </summary>
    public class DataService : IService
    {
        private readonly IPlayDataStorage _playDataStorage;
        private readonly ICacheStorage _cacheStorage;
        private readonly TcpService _serverSocket;
        private readonly ClientSession _loginService;
        private readonly SettingsModel _setting;
        private readonly object _cacheSync = new object();
        private readonly HashSet<string> _uncachedCharacters = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, object> _characterSync = new ConcurrentDictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, object> _accountSync = new ConcurrentDictionary<string, object>(StringComparer.Ordinal);

        public DataService(SettingsModel conf, ClientSession loginService, IPlayDataStorage playDataStorage, ICacheStorage cacheStorage)
        {
            _setting = conf;
            _loginService = loginService;
            _playDataStorage = playDataStorage;
            _cacheStorage = cacheStorage;
            _serverSocket = new TcpService();
            _serverSocket.Connected += Connecting;
            _serverSocket.Disconnected += Disconnected;
            _serverSocket.Received += Received;
        }

        public void Initialize()
        {
            TouchSocketConfig touchSocketConfig = new TouchSocketConfig();
            touchSocketConfig.SetListenIPHosts(new IPHost[1]
            {
                new IPHost(IPAddress.Parse(_setting.ServerAddr), _setting.ServerPort)
            }).SetTcpDataHandlingAdapter(() => new PlayerDataFixedHeaderDataHandlingAdapter());
            _serverSocket.Setup(touchSocketConfig);
        }

        public void Start()
        {
            _serverSocket.Start();
            _playDataStorage.LoadQuickList();
            LogService.Info($"玩家数据存储服务[{_setting.ServerAddr}:{_setting.ServerPort}]已启动.等待链接...");
        }

        public void Stop()
        {
            _serverSocket.Stop();
        }

        private Task Received(IClient client, ReceivedDataEventArgs e)
        {
            if (e.RequestInfo is not PlayerDataMessageFixedHeaderRequestInfo fixedHeader)
            {
                return Task.CompletedTask;
            }

            if (fixedHeader.Header.PacketCode != Grobal2.PacketCode)
            {
                LogService.Error("验证玩家数据封包头出现异常...");
                return Task.CompletedTask;
            }
            SocketClient clientSoc = (SocketClient)client;
            ServerRequestData messageData = SerializerUtil.Deserialize<ServerRequestData>(fixedHeader.Message);
            ProcessMessagePacket(clientSoc.Id, messageData);
            return Task.CompletedTask;
        }

        private Task Connecting(IClient client, ConnectedEventArgs e)
        {
            SocketClient clientSoc = (SocketClient)client;
            if (!DBShare.CheckServerIP(clientSoc.IP))
            {
                LogService.Warn("非法服务器连接: " + clientSoc.IP);
                clientSoc.Close();
            }
            LogService.Info("服务器连接: " + clientSoc.IP);
            return Task.CompletedTask;
        }

        private Task Disconnected(IClient client, DisconnectEventArgs e)
        {
            return Task.CompletedTask;
        }

        private void ProcessMessagePacket(string connectionId, ServerRequestData requestData)
        {
            int queryId = requestData.QueryId;
            ServerRequestMessage requestMessage = SerializerUtil.Deserialize<ServerRequestMessage>(EDCode.DecodeBuff(requestData.Message));
            int packetLen = requestData.Message.Length + requestData.Packet.Length + ServerDataPacket.FixedHeaderLen;
            if (packetLen >= Messages.DefBlockSize && queryId > 0 && requestData.Packet != null && requestData.Sign != null)
            {
                byte[] sData = EDCode.DecodeBuff(requestData.Packet);
                int checkCode = HUtil32.MakeLong((ushort)(queryId ^ 170), (ushort)packetLen);
                if (checkCode <= 0)
                {
                    ProcessServerMsg(queryId, requestMessage, sData, connectionId);
                    return;
                }
                if (requestData.Sign.Length <= 0)
                {
                    ProcessServerMsg(queryId, requestMessage, sData, connectionId);
                    return;
                }
                byte[] signatureBuff = BitConverter.GetBytes(checkCode);
                short signatureId = BitConverter.ToInt16(signatureBuff);
                byte[] signBuff = EDCode.DecodeBuff(requestData.Sign);
                short signId = BitConverter.ToInt16(signBuff);
                if (signId == signatureId)
                {
                    ProcessServerMsg(queryId, requestMessage, sData, connectionId);
                    return;
                }
                if (_serverSocket.TryGetSocketClient(connectionId, out SocketClient client))
                {
                    client.Close();
                }
                LogService.Error($"关闭错误的任务{queryId}查询请求.");
                return;
            }
            ServerRequestData responsePack = new ServerRequestData();
            ServerRequestMessage messagePacket = new ServerRequestMessage(Messages.DBR_FAIL, 0, 0, 0, 0);
            responsePack.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(messagePacket));
            SendRequest(connectionId, queryId, responsePack);
        }

        private void ProcessServerMsg(int nQueryId, ServerRequestMessage packet, byte[] sData, string connectionId)
        {
            switch (packet.Ident)
            {
                case Messages.DB_LOADHUMANRCD:
                    LoadHumanRcd(nQueryId, sData, connectionId);
                    break;
                case Messages.DB_SAVEHUMANRCD:
                    SaveHumanRcd(nQueryId, packet.Recog, sData, connectionId);
                    break;
                case Messages.DB_SAVEHUMANRCDEX:
                    SaveHumanRcdEx(nQueryId, sData, packet.Recog, connectionId);
                    break;
                default:
                    ServerRequestData responsePack = new ServerRequestData();
                    ServerRequestMessage messagePacket = new ServerRequestMessage(Messages.DBR_FAIL, 0, 0, 0, 0);
                    responsePack.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(messagePacket));
                    SendRequest(connectionId, nQueryId, responsePack);
                    break;
            }
        }

        private void LoadHumanRcd(int queryId, byte[] data, string connectionId)
        {
            LoadCharacterData loadHumanPacket = default;
            CharacterDataInfo humanRcd = null;
            int nCheckCode = -1;
            try
            {
                loadHumanPacket = SerializerUtil.Deserialize<LoadCharacterData>(data);
                if (loadHumanPacket.SessionID > 0 && !string.IsNullOrEmpty(loadHumanPacket.Account) && !string.IsNullOrEmpty(loadHumanPacket.ChrName))
                {
                    humanRcd = ReadSessionRecord(loadHumanPacket, ref nCheckCode);
                }
            }
            catch (Exception e)
            {
                nCheckCode = -2;
                LogService.Error("读取玩家数据失败: " + e.GetType().Name);
            }
            ServerRequestData responsePack = new ServerRequestData();
            if (nCheckCode == 1)
            {
                LoadPlayerDataPacket loadHumData = new LoadPlayerDataPacket();
                loadHumData.ChrName = EDCode.EncodeString(loadHumanPacket.ChrName);
                loadHumData.HumDataInfo = humanRcd;
                ServerRequestMessage messagePacket = new ServerRequestMessage(Messages.DBR_LOADHUMANRCD, 1, 0, 0, 1);
                responsePack.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(messagePacket));
                SendRequest(connectionId, queryId, responsePack, loadHumData);
            }
            else
            {
                ServerRequestMessage messagePacket = new ServerRequestMessage(Messages.DBR_LOADHUMANRCD, nCheckCode, 0, 0, 0);
                responsePack.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(messagePacket));
                SendRequest(connectionId, queryId, responsePack);
            }
        }

        private CharacterDataInfo ReadSessionRecord(LoadCharacterData packet, ref int checkCode)
        {
            // This read-only hint rejects a duplicate without waiting behind the
            // owning load. Only acquisition inside the character gate is authoritative.
            if (_loginService.IsSessionRecordLoaded(packet.Account, packet.SessionID))
            {
                return null;
            }
            // Account ordering also covers selecting a different character with
            // the same native session. Always acquire account before character.
            lock (_accountSync.GetOrAdd(packet.Account, _ => new object()))
            lock (_characterSync.GetOrAdd(packet.ChrName, _ => new object()))
            {
                bool foundSession = false;
                checkCode = _loginService.CheckSessionLoadRcd(packet.Account, packet.UserAddr, packet.SessionID, ref foundSession);
                if (checkCode != 1)
                {
                    return null;
                }
                try
                {
                    if (_playDataStorage.Index(packet.ChrName) < 0)
                    {
                        checkCode = -3;
                        return null;
                    }
                    CharacterDataInfo record = null;
                    lock (_cacheSync)
                    {
                        if (!_uncachedCharacters.Contains(packet.ChrName))
                        {
                            try
                            {
                                record = _cacheStorage.Get(packet.ChrName, out bool exists);
                                if (!exists || record?.Header == null || record.Data == null)
                                {
                                    record = null;
                                    if (exists) InvalidateCachedCharacter(packet.ChrName);
                                }
                            }
                            catch (Exception)
                            {
                                InvalidateCachedCharacter(packet.ChrName);
                            }
                        }
                    }
                    if (record == null && !_playDataStorage.Get(packet.ChrName, ref record))
                    {
                        checkCode = -2;
                    }
                    if (record?.Header == null || record.Data == null)
                    {
                        checkCode = -2;
                    }
                    return checkCode == 1 ? record : null;
                }
                catch (Exception e)
                {
                    checkCode = -2;
                    LogService.Error("读取玩家数据失败: " + e.GetType().Name);
                    return null;
                }
                finally
                {
                    // Acquire and failed-load release belong to the same ordered
                    // operation. A preceding save cannot release a newer load claim.
                    if (checkCode != 1)
                    {
                        try
                        {
                            _loginService.SetSessionSaveRcd(packet.Account, packet.SessionID);
                        }
                        catch (Exception e)
                        {
                            LogService.Error("释放失败读取请求异常: " + e.GetType().Name);
                        }
                    }
                }
            }
        }

        private void SaveHumanRcd(int queryId, int nRecog, byte[] sMsg, string connectionId)
        {
            bool committed = false;
            try
            {
                SaveCharacterData saveHumDataPacket = SerializerUtil.Deserialize<SaveCharacterData>(sMsg);
                CharacterDataInfo humanRcd = saveHumDataPacket?.CharacterData;
                if (humanRcd?.Header != null && humanRcd.Data != null && !string.IsNullOrEmpty(saveHumDataPacket.Account) && !string.IsNullOrEmpty(saveHumDataPacket.ChrName))
                {
                    committed = SaveAndPublish(saveHumDataPacket.Account, saveHumDataPacket.ChrName, nRecog, humanRcd);
                }
            }
            catch (Exception e)
            {
                LogService.Error("保存玩家数据失败: " + e.GetType().Name);
            }
            ServerRequestData responsePack = new ServerRequestData();
            ServerRequestMessage messagePacket = new ServerRequestMessage(committed ? Messages.DBR_SAVEHUMANRCD : Messages.DBR_LOADHUMANRCD, committed ? 1 : 0, 0, 0, 0);
            responsePack.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(messagePacket));
            SendRequest(connectionId, queryId, responsePack);
        }

        private bool SaveAndPublish(string account, string chrName, int sessionId, CharacterDataInfo humanRcd)
        {
            lock (_accountSync.GetOrAdd(account, _ => new object()))
            lock (_characterSync.GetOrAdd(chrName, _ => new object()))
            {
                bool committed = false;
                try
                {
                    humanRcd.Header.SetName(chrName);
                    int nIndex = _playDataStorage.Index(chrName);
                    // The legacy Add fallback and Update are separate storage transactions.
                    bool recordAvailable = nIndex >= 0 || (_playDataStorage.Add(humanRcd) && _playDataStorage.Index(chrName) >= 0);
                    committed = recordAvailable && _playDataStorage.Update(chrName, humanRcd);
                }
                catch (Exception e)
                {
                    LogService.Error("保存玩家数据失败: " + e.GetType().Name);
                }
                lock (_cacheSync)
                {
                    if (!committed)
                    {
                        // A false/exception outcome can occur after a database commit.
                        // Keep the session claim and bypass any earlier cached snapshot.
                        InvalidateCachedCharacter(chrName);
                        return false;
                    }
                    _uncachedCharacters.Add(chrName);
                    try
                    {
                        _cacheStorage.Add(chrName, humanRcd);
                        _uncachedCharacters.Remove(chrName);
                    }
                    catch (Exception e)
                    {
                        InvalidateCachedCharacter(chrName);
                        LogService.Error("保存已提交，缓存刷新失败: " + e.GetType().Name);
                    }
                }
                try
                {
                    _loginService.SetSessionSaveRcd(account, sessionId);
                }
                catch (Exception e)
                {
                    // Cleanup cannot undo an acknowledged storage commit.
                    LogService.Error("保存已提交，会话更新失败: " + e.GetType().Name);
                }
                return true;
            }
        }

        private void InvalidateCachedCharacter(string chrName)
        {
            // Keep a bypass marker even if the cache backend also fails to delete.
            _uncachedCharacters.Add(chrName);
            try
            {
                _cacheStorage.Delete(chrName);
            }
            catch (Exception)
            {
                LogService.Error("缓存失效操作失败；后续读取绕过缓存.");
            }
        }

        private void SaveHumanRcdEx(int nQueryId, byte[] sMsg, int nRecog, string connectionId)
        {
            SaveHumanRcd(nQueryId, nRecog, sMsg, connectionId);
        }

        private void SendRequest(string connectionId, int queryId, ServerRequestData requestPacket)
        {
            requestPacket.QueryId = queryId;
            int checkCode;
            if (requestPacket.Packet != null)
            {
                checkCode = GetCheckCode(queryId, requestPacket);
            }
            else
            {
                requestPacket.Packet = Array.Empty<byte>();
                checkCode = HUtil32.MakeLong((ushort)(queryId ^ 170), (ushort)(requestPacket.Message.Length + ServerDataPacket.FixedHeaderLen));
            }
            byte[] nCheckCode = BitConverter.GetBytes(checkCode);
            requestPacket.Sign = EDCode.EncodeBuffer(nCheckCode);
            SendMessage(connectionId, SerializerUtil.Serialize(requestPacket));
        }

        private void SendRequest<T>(string connectionId, int queryId, ServerRequestData requestPacket, T packet) where T : new()
        {
            requestPacket.QueryId = queryId;
            if (packet != null)
            {
                requestPacket.Packet = EDCode.EncodeBuffer(SerializerUtil.Serialize(packet));
            }
            int signId = GetCheckCode(queryId, requestPacket);
            requestPacket.Sign = EDCode.EncodeBuffer(BitConverter.GetBytes(signId));
            SendMessage(connectionId, SerializerUtil.Serialize(requestPacket));
        }

        private int GetCheckCode(int queryId, ServerRequestData packet)
        {
            return HUtil32.MakeLong((ushort)(queryId ^ 170), (ushort)(packet.Message.Length + packet.Packet.Length + ServerDataPacket.FixedHeaderLen));
        }

        private void SendMessage(string connectionId, byte[] sendBuffer)
        {
            ServerDataPacket serverMessage = new ServerDataPacket
            {
                PacketCode = Grobal2.PacketCode,
                PacketLen = (ushort)sendBuffer.Length
            };
            byte[] dataBuff = SerializerUtil.Serialize(serverMessage);
            byte[] data = new byte[ServerDataPacket.FixedHeaderLen + sendBuffer.Length];
            MemoryCopy.BlockCopy(dataBuff, 0, data, 0, dataBuff.Length);
            MemoryCopy.BlockCopy(sendBuffer, 0, data, dataBuff.Length, sendBuffer.Length);
            _serverSocket.Send(connectionId, data);
        }
    }
}
