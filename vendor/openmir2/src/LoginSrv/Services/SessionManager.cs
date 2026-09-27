namespace LoginSrv.Services
{
    public class SessionManager
    {
        private readonly Dictionary<int, SessionConnInfo> sessionMap = new Dictionary<int, SessionConnInfo>();
        private readonly Dictionary<string, SessionConnInfo> sessionAccountMap = new Dictionary<string, SessionConnInfo>(StringComparer.OrdinalIgnoreCase);
        private readonly object syncRoot = new object();

        public void AddSession(int sessionId, SessionConnInfo sessionConnInfo)
        {
            lock (syncRoot)
            {
                if (sessionMap.ContainsKey(sessionId) || sessionAccountMap.ContainsKey(sessionConnInfo.Account))
                {
                    throw new InvalidOperationException("The account or session is already active.");
                }
                sessionMap.Add(sessionId, sessionConnInfo);
                sessionAccountMap.Add(sessionConnInfo.Account, sessionConnInfo);
            }
        }

        public SessionConnInfo GetSession(string account)
        {
            lock (syncRoot)
            {
                return sessionAccountMap.TryGetValue(account, out SessionConnInfo session) ? session : null;
            }
        }

        public void UpdateSession(int sessionId, string sServerName, bool isPayMent)
        {
            lock (syncRoot)
            {
                if (sessionMap.TryGetValue(sessionId, out SessionConnInfo session))
                {
                    session.ServerName = sServerName;
                    session.IsPayMent = isPayMent;
                }
            }
        }

        public bool IsLogin(int sessionId)
        {
            lock (syncRoot)
            {
                return sessionMap.ContainsKey(sessionId);
            }
        }

        public bool IsLogin(string sessionId)
        {
            lock (syncRoot)
            {
                return sessionAccountMap.ContainsKey(sessionId);
            }
        }

        public void Delete(string account, int sessionId)
        {
            lock (syncRoot)
            {
                if (sessionMap.TryGetValue(sessionId, out SessionConnInfo session)
                    && string.Equals(session.Account, account, StringComparison.OrdinalIgnoreCase))
                {
                    sessionMap.Remove(sessionId);
                    if (sessionAccountMap.TryGetValue(account, out SessionConnInfo active)
                        && ReferenceEquals(active, session))
                    {
                        sessionAccountMap.Remove(account);
                    }
                }
            }
        }

        public SessionConnInfo[] GetSessions()
        {
            lock (syncRoot)
            {
                return sessionMap.Count > 0 ? sessionMap.Values.ToArray() : null;
            }
        }
    }
}
