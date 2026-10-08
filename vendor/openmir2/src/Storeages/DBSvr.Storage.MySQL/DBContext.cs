using MySqlConnector;
using NLog;
using OpenMir2;
using System;
using System.Data;
using System.Data.Common;

namespace DBSrv.Storage.MySQL
{
    public class StorageContext : IDisposable
    {

        private readonly StorageOption _storageOption;
        private MySqlConnection? _connection;
        private MySqlTransaction? _transaction;

        public StorageContext(StorageOption storageOption)
        {
            _storageOption = storageOption;
        }

        public virtual void Open(ref bool success)
        {
            success = false;
            try
            {
                _connection = new MySqlConnection(_storageOption.ConnectionString);
                _connection.Open();
                success = true;
            }
            catch (Exception e)
            {
                LogService.Error("打开数据库[MySql]失败.");
                LogService.Error(e.StackTrace);
                success = false;
            }
        }

        public MySqlCommand CreateCommand()
        {
            return new MySqlCommand(connection: _connection, transaction: _transaction);
        }

        // Keep command construction and parameters in the production save methods;
        // execution is the single overridable boundary for isolated storage tests.
        public virtual int ExecuteNonQuery(MySqlCommand command) => command.ExecuteNonQuery();

        public virtual DbDataReader ExecuteReader(MySqlCommand command) => command.ExecuteReader();

        public virtual long GetLastInsertedId(MySqlCommand command) => command.LastInsertedId;

        public MySqlConnection GetConnection()
        {
            return _connection;
        }

        public virtual void BeginTransaction()
        {
            if (_transaction != null || _connection == null || _connection.State != ConnectionState.Open)
            {
                throw new InvalidOperationException("An open connection without an existing transaction is required.");
            }
            _transaction = _connection.BeginTransaction();
        }

        public virtual void Commit()
        {
            if (_transaction == null)
            {
                throw new InvalidOperationException("Cannot commit without a transaction.");
            }
            _transaction.Commit();
        }

        public virtual void RollBack()
        {
            if (_transaction != null)
            {
                _transaction.Rollback();
            }
        }

        public virtual void Dispose()
        {
            try
            {
                _transaction?.Dispose();
            }
            finally
            {
                _transaction = null;
                try
                {
                    _connection?.Dispose();
                }
                finally
                {
                    _connection = null;
                }
            }
        }
    }
}
