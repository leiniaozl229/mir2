using TcpClient = TouchSocket.Sockets.TcpClient;

namespace GameSrv.Services
{
    /// <summary>
    /// 玩家数据读写服务
    /// </summary>
    public class DataQueryServer
    {
        private readonly TcpClient _tcpClient;
        private readonly SemaphoreSlim _connectGate = new SemaphoreSlim(1, 1);
        private readonly object _lifetimeGate = new object();
        private readonly object _receiveGate = new object();
        private CancellationTokenSource _connectCancellation = new CancellationTokenSource();
        private volatile bool _stopped = true;
        private long _connectionEpoch;
        private byte[] ReceiveBuffer { get; set; }
        private int BuffLen { get; set; }
        private bool SocketWorking { get; set; }

        public DataQueryServer()
        {
            _tcpClient = new TcpClient();
            _tcpClient.Connected = DataSocketConnected;
            _tcpClient.Disconnected = DataSocketDisconnected;
            _tcpClient.Received = DataSocketRead;
            SocketWorking = false;
            ReceiveBuffer = new byte[10 * 2048];
        }

        public void Initialize()
        {
            _tcpClient.Setup(new TouchSocketConfig()
            .SetRemoteIPHost(new IPHost(IPAddress.Parse(SystemShare.Config.sDBAddr), SystemShare.Config.nDBPort))
            .ConfigureContainer(a =>
            {
                a.AddConsoleLogger();
            })
            .ConfigurePlugins(plugins =>
            {
                plugins.UseReconnection<TcpClient>()
                    .SetTick(TimeSpan.FromSeconds(1))
                    .SetActionForCheck((client, _) => _stopped ? (bool?)null : client.Online)
                    .SetConnectAction(async client => await TryConnect())
                    .UsePolling();
            }));
        }

        public async Task Start()
        {
            lock (_lifetimeGate)
            {
                if (_stopped)
                {
                    _connectCancellation.Dispose();
                    _connectCancellation = new CancellationTokenSource();
                    _stopped = false;
                }
            }
            await TryConnect();
        }

        private async Task<bool> TryConnect()
        {
            CancellationToken cancellation;
            lock (_lifetimeGate)
                cancellation = _connectCancellation.Token;
            bool acquired = false;
            try
            {
                await _connectGate.WaitAsync(cancellation);
                acquired = true;
                if (_stopped || _tcpClient.Online)
                    return true;
                await _tcpClient.ConnectAsync(1000, cancellation);
                if (_stopped)
                    _tcpClient.Close();
                return _stopped || _tcpClient.Online;
            }
            catch (OperationCanceledException)
            {
                return true;
            }
            catch (Exception)
            {
                return _stopped;
            }
            finally
            {
                if (acquired)
                    _connectGate.Release();
            }
        }

        public void Stop()
        {
            lock (_lifetimeGate)
            {
                _stopped = true;
                _connectCancellation.Cancel();
            }
            _tcpClient.Close();
            ResetReceiveState();
        }

        public bool IsConnected => _tcpClient.Online;

        public bool SendRequest<T>(int queryId, ServerRequestMessage message, T packet)
        {
            if (!_tcpClient.Online)
            {
                return false;
            }
            ServerRequestData requestPacket = new ServerRequestData();
            requestPacket.QueryId = queryId;
            requestPacket.Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(message));
            requestPacket.Packet = EDCode.EncodeBuffer(SerializerUtil.Serialize(packet));
            int signId = HUtil32.MakeLong((ushort)(queryId ^ 170), (ushort)(requestPacket.Message.Length + requestPacket.Packet.Length + ServerDataPacket.FixedHeaderLen));
            requestPacket.Sign = EDCode.EncodeBuffer(BitConverter.GetBytes(signId));
            SendMessage(SerializerUtil.Serialize(requestPacket));
            return true;
        }

        private void SendMessage(byte[] sendBuffer)
        {
            ServerDataPacket serverMessage = new ServerDataPacket
            {
                PacketCode = Grobal2.PacketCode,
                PacketLen = (ushort)sendBuffer.Length
            };
            byte[] dataBuff = SerializerUtil.Serialize(serverMessage);
            byte[] data = new byte[ServerDataPacket.FixedHeaderLen + sendBuffer.Length];
            MemoryCopy.BlockCopy(dataBuff, 0, data, 0, data.Length);
            MemoryCopy.BlockCopy(sendBuffer, 0, data, dataBuff.Length, sendBuffer.Length);
            _tcpClient.Send(data);
        }

        private Task DataSocketDisconnected(ITcpClientBase sender, DisconnectEventArgs e)
        {
            ResetReceiveState();
            LogService.Error("数据库服务器[" + sender.GetIPPort() + "]断开连接...");
            return Task.CompletedTask;
        }

        private Task DataSocketConnected(ITcpClient client, ConnectedEventArgs e)
        {
            ResetReceiveState();
            if (_stopped)
            {
                client.Close();
                return Task.CompletedTask;
            }
            LogService.Info("数据库服务器[" + client.RemoteIPHost + "]连接成功...");
            return Task.CompletedTask;
        }

        private void ResetReceiveState()
        {
            lock (_receiveGate)
            {
                _connectionEpoch++;
                BuffLen = 0;
                SocketWorking = false;
            }
        }

        private Task DataSocketRead(TcpClient sender, ReceivedDataEventArgs e)
        {
            long epoch = Interlocked.Read(ref _connectionEpoch);
            HUtil32.EnterCriticalSection(_receiveGate);
            try
            {
                if (_stopped || !sender.Online || epoch != _connectionEpoch)
                    return Task.CompletedTask;
                int nMsgLen = e.ByteBlock.Len;
                ReadOnlySpan<byte> packetData = e.ByteBlock.Buffer.AsSpan(0, nMsgLen);
                if (BuffLen > 0)
                {
                    byte[] combined = new byte[BuffLen + nMsgLen];
                    ReceiveBuffer.AsSpan(0, BuffLen).CopyTo(combined);
                    packetData.CopyTo(combined.AsSpan(BuffLen));
                    ProcessServerPacket(combined, combined.Length);
                }
                else
                {
                    ProcessServerPacket(packetData, nMsgLen);
                }
            }
            catch (Exception exception)
            {
                LogService.Error(exception);
            }
            finally
            {
                HUtil32.LeaveCriticalSection(_receiveGate);
            }
            return Task.CompletedTask;
        }

        private void ProcessServerPacket(ReadOnlySpan<byte> buff, int buffLen)
        {
            try
            {
                int offset = 0;
                while (buffLen - offset >= ServerDataPacket.FixedHeaderLen)
                {
                    ReadOnlySpan<byte> packetHead = buff.Slice(offset, ServerDataPacket.FixedHeaderLen);
                    ServerDataPacket message = SerializerUtil.Deserialize<ServerDataPacket>(packetHead.ToArray());
                    if (message.PacketCode != Grobal2.PacketCode)
                    {
                        offset++;
                        continue;
                    }
                    int nCheckMsgLen = message.PacketLen + ServerDataPacket.FixedHeaderLen;
                    if (nCheckMsgLen > buffLen - offset)
                    {
                        break;
                    }
                    try
                    {
                        SocketWorking = true;
                        ServerRequestData messageData = SerializerUtil.Deserialize<ServerRequestData>(
                            buff.Slice(offset + ServerDataPacket.FixedHeaderLen, message.PacketLen).ToArray());
                        ProcessServerData(messageData);
                    }
                    catch (Exception)
                    {
                        LogService.Warn("DBSrv外层回复格式无效.");
                    }
                    finally { SocketWorking = false; }
                    offset += nCheckMsgLen;
                }
                BuffLen = buffLen - offset;
                if (BuffLen > ReceiveBuffer.Length)
                    ReceiveBuffer = new byte[BuffLen];
                buff.Slice(offset, BuffLen).CopyTo(ReceiveBuffer);
            }
            catch (Exception ex)
            {
                LogService.Error(ex);
            }
        }

        private void ProcessServerData(ServerRequestData responsePacket)
        {
            try
            {
                if (!SocketWorking)
                {
                    return;
                }

                if (responsePacket != null)
                {
                    int respCheckCode = responsePacket.QueryId;
                    int nLen = responsePacket.Message.Length + responsePacket.Packet.Length + ServerDataPacket.FixedHeaderLen;
                    if (nLen >= 12)
                    {
                        int queryId = HUtil32.MakeLong((ushort)(respCheckCode ^ 170), (ushort)nLen);
                        if (queryId <= 0 || responsePacket.Sign.Length <= 0)
                        {
                            SystemShare.Config.LoadDBErrorCount++;
                            return;
                        }
                        byte[] signatureBuff = BitConverter.GetBytes(queryId);
                        byte[] signBuff = EDCode.DecodeBuff(responsePacket.Sign);
                        if (BitConverter.ToInt16(signatureBuff) == BitConverter.ToInt16(signBuff))
                        {
                            PlayerDataService.Enqueue(respCheckCode, responsePacket);
                        }
                        else
                        {
                            SystemShare.Config.LoadDBErrorCount++;
                        }
                    }
                }
                else
                {
                    LogService.Error("错误的封包数据");
                }
            }
            finally
            {
                SocketWorking = false;
            }
        }
    }
}
