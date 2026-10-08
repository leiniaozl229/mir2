using DBSrv.Storage.Model;
using OpenMir2;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace DBSrv.Storage.MySQL
{
    public partial class PlayDataStorage : IPlayDataStorage
    {
        public bool Update(string chrName, CharacterDataInfo humanRcd)
        {
            if (string.IsNullOrEmpty(chrName) || humanRcd == null) return false;
            if (_NameQuickMap.TryGetValue(chrName, out int playerId))
            {
                if (SaveRecord(playerId, chrName, ref humanRcd))
                {
                    return true;
                }
                return false;
            }
            return false;
        }

        public bool UpdateQryChar(int nIndex, QueryChr queryChrRcd)
        {
            bool result = false;
            if ((nIndex >= 0) && (_NameQuickMap.Count > nIndex))
            {
                if (UpdateChrRecord(nIndex, queryChrRcd))
                {
                    result = true;
                }
            }
            return result;
        }

        /// <summary>
        /// 保存玩家数据
        /// todo 保存前要先获取一次数据，部分数据要进行对比
        /// </summary>
        /// <returns></returns>
        protected virtual StorageContext CreateSaveContext() => new StorageContext(_storageOption);

        private bool SaveRecord(int playerId, string chrName, ref CharacterDataInfo humanRcd)
        {
            StorageContext context = CreateSaveContext();
            bool result = false;
            try
            {
                bool success = false;
                context.Open(ref success);
                if (!success)
                {
                    return false;
                }
                context.BeginTransaction();
                RequireSaveRows(context, playerId, chrName, humanRcd);
                SaveRecord(context, playerId, humanRcd.Data);
                SaveAblity(context, playerId, humanRcd.Data.Abil);
                SaveItem(context, playerId, humanRcd.Data.HumItems);
                SaveBagItem(context, playerId, humanRcd.Data.BagItems);
                SaveStorageItem(context, playerId, humanRcd.Data.StorageItems);
                ReplaceItemAttrs(context, playerId, humanRcd.Data.HumItems,
                    humanRcd.Data.BagItems, humanRcd.Data.StorageItems);
                SaveMagics(context, playerId, humanRcd.Data.Magic);
                SaveBonusability(context, playerId, humanRcd.Data.BonusAbil);
                SaveStatus(context, playerId, humanRcd.Data.StatusTimeArr);
                SaveQuest(context, playerId, humanRcd.Data);
                context.Commit();
                result = true;
                LogService.Debug($"保存角色[{chrName}]数据成功");
            }
            catch (Exception ex)
            {
                result = false;
                try
                {
                    context.RollBack();
                }
                catch (Exception rollbackError)
                {
                    // A lost connection can make rollback fail too. Never replace the
                    // failed save result with an exception or a success acknowledgement.
                    LogService.Error("[Exception] PlayDataStorage.RollBack: " + rollbackError.Message);
                }
                LogService.Error($"保存角色[{chrName}]数据失败. " + ex.GetType().Name);
            }
            finally
            {
                try
                {
                    context.Dispose();
                }
                catch (Exception disposeError)
                {
                    result = false;
                    LogService.Error("[Exception] PlayDataStorage.Dispose: " + disposeError.Message);
                }
            }
            return result;
        }

        private static void RequireSaveRows(StorageContext context, int playerId, string chrName,
            CharacterDataInfo humanRcd)
        {
            if (humanRcd?.Header == null || humanRcd.Data == null
                || string.IsNullOrEmpty(chrName) || string.IsNullOrEmpty(humanRcd.Data.Account)
                || !string.Equals(chrName, humanRcd.Header.Name, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(chrName, humanRcd.Data.ChrName, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("The save snapshot identity does not match its character key.");
            }
            // Acquire only this character's rows, in one fixed order, before any
            // UPDATE. The locks end with this save's transaction. A matched row can
            // legitimately report zero changed rows; an absent row cannot be saved.
            using (MySqlConnector.MySqlCommand command = context.CreateCommand())
            {
                command.CommandText = "SELECT Id,ChrName,LoginID,Deleted FROM characters WHERE Id=@PlayerId FOR UPDATE";
                command.Parameters.AddWithValue("@PlayerId", playerId);
                using System.Data.Common.DbDataReader reader = context.ExecuteReader(command);
                if (!reader.Read()
                    || Convert.ToInt32(reader["Id"]) != playerId
                    || !string.Equals(Convert.ToString(reader["ChrName"]), chrName, StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(Convert.ToString(reader["LoginID"]), humanRcd.Data.Account, StringComparison.OrdinalIgnoreCase)
                    || reader["Deleted"] is DBNull || Convert.ToInt32(reader["Deleted"]) != 0
                    || reader.Read())
                {
                    throw new InvalidOperationException("The existing character row is missing, deleted, or owned by a different identity.");
                }
            }
            foreach (string table in new[] { "characters_ablity", "characters_status" })
            {
                using MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = "SELECT PlayerId FROM " + table + " WHERE PlayerId=@PlayerId FOR UPDATE";
                command.Parameters.AddWithValue("@PlayerId", playerId);
                using System.Data.Common.DbDataReader reader = context.ExecuteReader(command);
                if (!reader.Read() || Convert.ToInt32(reader["PlayerId"]) != playerId || reader.Read())
                {
                    throw new InvalidOperationException("A required character save row is missing or mismatched.");
                }
            }
        }

        // The normal load helpers log and suppress read errors. A save must instead
        // abort if its comparison snapshot cannot be read in the same transaction.
        // Instance attributes do not participate in the slot comparison and are
        // reconciled separately by ReplaceItemAttrs below.
        private static ServerUserItem[] ReadItemSlotsForSave(StorageContext context, int playerId,
            string table, int slotCount)
            => ReadItemSlotsForSave(context, playerId, table, slotCount, out _, false);

        private static ServerUserItem[] ReadItemSlotsForSave(StorageContext context, int playerId,
            string table, int slotCount, out long[] rowIds, bool lockExisting)
        {
            rowIds = new long[slotCount];
            ServerUserItem[] items = new ServerUserItem[slotCount];
            using MySqlConnector.MySqlCommand command = context.CreateCommand();
            command.CommandText = "SELECT * FROM " + table + " WHERE PlayerId=@PlayerId";
            command.Parameters.AddWithValue("@PlayerId", playerId);
            using (System.Data.Common.DbDataReader reader = context.ExecuteReader(command))
            {
                while (reader.Read())
                {
                    int position = reader.GetInt32(reader.GetOrdinal("Position"));
                    long rowId = Convert.ToInt64(reader["Id"]);
                    if (position < 0 || position >= slotCount || rowId <= 0 || items[position] != null)
                    {
                        throw new InvalidOperationException("The item slot snapshot has an invalid or duplicate position.");
                    }
                    rowIds[position] = rowId;
                    items[position] = ReadSavedSlot(reader);
                }
            }
            if (lockExisting)
            {
                // These legacy tables have an Id primary key, not a unique/indexed
                // (PlayerId,Position) key. Lock known Ids directly rather than
                // scanning and locking unrelated characters' slot rows.
                long[] lockedRowIds = rowIds;
                foreach (int position in Enumerable.Range(0, slotCount).Where(i => lockedRowIds[i] > 0).OrderBy(i => lockedRowIds[i]))
                {
                    using MySqlConnector.MySqlCommand locked = context.CreateCommand();
                    locked.CommandText = "SELECT Id,PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax FROM " + table + " WHERE Id=@RowId FOR UPDATE";
                    locked.Parameters.AddWithValue("@RowId", rowIds[position]);
                    using System.Data.Common.DbDataReader reader = context.ExecuteReader(locked);
                    if (!reader.Read() || Convert.ToInt64(reader["Id"]) != rowIds[position]
                        || Convert.ToInt32(reader["PlayerId"]) != playerId || Convert.ToInt32(reader["Position"]) != position)
                    {
                        throw new InvalidOperationException("The item slot changed identity or disappeared before its save lock.");
                    }
                    // The first read was not locked. Compare against all of the
                    // latest locked item fields, including MakeIndex and durability.
                    items[position] = ReadSavedSlot(reader);
                    if (reader.Read()) throw new InvalidOperationException("The item slot ID is not unique.");
                }
            }
            return items;
        }

        private static ServerUserItem ReadSavedSlot(System.Data.Common.DbDataReader reader)
            => new ServerUserItem
            {
                MakeIndex = reader.GetInt32(reader.GetOrdinal("MakeIndex")),
                Index = Convert.ToUInt16(reader["StdIndex"]),
                Dura = Convert.ToUInt16(reader["Dura"]),
                DuraMax = Convert.ToUInt16(reader["DuraMax"])
            };

        private void SaveRecord(StorageContext context, int playerId, CharacterData hd)
        {
            StringBuilder strSql = new StringBuilder();
            strSql.AppendLine("UPDATE characters SET ServerIndex = @ServerIndex, LoginID = @LoginID,MapName = @MapName, CX = @CX, CY = @CY, Level = @Level, Dir = @Dir, Hair = @Hair, Sex = @Sex, Job = Job, Gold = @Gold, ");
            strSql.AppendLine("GamePoint = @GamePoint, HomeMap = @HomeMap, HomeX = @HomeX, HomeY = @HomeY, PkPoint = @PkPoint, ReLevel = @ReLevel, AttatckMode = @AttatckMode, FightZoneDieCount = @FightZoneDieCount, BodyLuck = @BodyLuck, IncHealth = @IncHealth, IncSpell = @IncSpell,");
            strSql.AppendLine("IncHealing = @IncHealing, CreditPoint = @CreditPoint, BonusPoint =@BonusPoint, HungerStatus =@HungerStatus, PayMentPoint = @PayMentPoint, LockLogon = @LockLogon, MarryCount = @MarryCount, AllowGroupReCall = @AllowGroupReCall, ");
            strSql.AppendLine("GroupRcallTime = @GroupRcallTime, AllowGuildReCall = @AllowGuildReCall, IsMaster = @IsMaster, MasterName = @MasterName, DearName = @DearName, StoragePwd = @StoragePwd, Deleted = @Deleted,LASTUPDATE = now() WHERE ID = @ID;");
            MySqlConnector.MySqlCommand command = context.CreateCommand();
            command.CommandText = strSql.ToString();
            command.Parameters.AddWithValue("@Id", playerId);
            command.Parameters.AddWithValue("@ServerIndex", hd.ServerIndex);
            command.Parameters.AddWithValue("@LoginID", hd.Account);
            command.Parameters.AddWithValue("@MapName", hd.CurMap);
            command.Parameters.AddWithValue("@CX", hd.CurX);
            command.Parameters.AddWithValue("@CY", hd.CurY);
            command.Parameters.AddWithValue("@Level", hd.Abil.Level);
            command.Parameters.AddWithValue("@Dir", hd.Dir);
            command.Parameters.AddWithValue("@Hair", hd.Hair);
            command.Parameters.AddWithValue("@Sex", hd.Sex);
            command.Parameters.AddWithValue("@Job", hd.Job);
            command.Parameters.AddWithValue("@Gold", hd.Gold);
            command.Parameters.AddWithValue("@GamePoint", hd.GamePoint);
            command.Parameters.AddWithValue("@HomeMap", hd.HomeMap);
            command.Parameters.AddWithValue("@HomeX", hd.HomeX);
            command.Parameters.AddWithValue("@HomeY", hd.HomeY);
            command.Parameters.AddWithValue("@PkPoint", hd.PKPoint);
            command.Parameters.AddWithValue("@ReLevel", hd.ReLevel);
            command.Parameters.AddWithValue("@AttatckMode", hd.AttatckMode);
            command.Parameters.AddWithValue("@FightZoneDieCount", hd.FightZoneDieCount);
            command.Parameters.AddWithValue("@BodyLuck", hd.BodyLuck);
            command.Parameters.AddWithValue("@IncHealth", hd.IncHealth);
            command.Parameters.AddWithValue("@IncSpell", hd.IncSpell);
            command.Parameters.AddWithValue("@IncHealing", hd.IncHealing);
            command.Parameters.AddWithValue("@CreditPoint", hd.CreditPoint);
            command.Parameters.AddWithValue("@BonusPoint", hd.BonusPoint);
            command.Parameters.AddWithValue("@HungerStatus", hd.HungerStatus);
            command.Parameters.AddWithValue("@PayMentPoint", hd.PayMentPoint);
            command.Parameters.AddWithValue("@LockLogon", hd.LockLogon);
            command.Parameters.AddWithValue("@MarryCount", hd.MarryCount);
            command.Parameters.AddWithValue("@AllowGroupReCall", hd.AllowGroup);
            command.Parameters.AddWithValue("@GroupRcallTime", hd.GroupRcallTime);
            command.Parameters.AddWithValue("@AllowGuildReCall", hd.AllowGuildReCall);
            command.Parameters.AddWithValue("@IsMaster", hd.IsMaster);
            command.Parameters.AddWithValue("@MasterName", hd.MasterName);
            command.Parameters.AddWithValue("@DearName", hd.DearName);
            command.Parameters.AddWithValue("@StoragePwd", hd.StoragePwd);
            command.Parameters.AddWithValue("@Deleted", 0);
            try
            {
                context.ExecuteNonQuery(command);
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.UpdateRecord:" + ex.Message);
                throw;
            }
        }

        private void SaveAblity(StorageContext context, int playerId, Ability Abil)
        {
            const string UpdateAblitySql = "UPDATE characters_ablity SET Level = @Level,Ac = @Ac, Mac = @Mac, Dc = @Dc, Mc = @Mc, Sc = @Sc, Hp = @Hp, Mp = @Mp, MaxHP = @MaxHP,MAxMP = @MAxMP, Exp = @Exp, MaxExp = @MaxExp, Weight = @Weight, MaxWeight = @MaxWeight, WearWeight = @WearWeight,MaxWearWeight = @MaxWearWeight, HandWeight = @HandWeight, MaxHandWeight = @MaxHandWeight,ModifyTime=now() WHERE PlayerId = @PlayerId;";
            MySqlConnector.MySqlCommand command = context.CreateCommand();
            command.CommandText = UpdateAblitySql;
            command.Parameters.AddWithValue("@PlayerId", playerId);
            command.Parameters.AddWithValue("@Level", Abil.Level);
            command.Parameters.AddWithValue("@Ac", Abil.Level);
            command.Parameters.AddWithValue("@Mac", Abil.MAC);
            command.Parameters.AddWithValue("@Dc", Abil.DC);
            command.Parameters.AddWithValue("@Mc", Abil.MC);
            command.Parameters.AddWithValue("@Sc", Abil.SC);
            command.Parameters.AddWithValue("@Hp", Abil.HP);
            command.Parameters.AddWithValue("@Mp", Abil.MP);
            command.Parameters.AddWithValue("@MaxHP", Abil.MaxHP);
            command.Parameters.AddWithValue("@MAxMP", Abil.MaxMP);
            command.Parameters.AddWithValue("@Exp", Abil.Exp);
            command.Parameters.AddWithValue("@MaxExp", Abil.MaxExp);
            command.Parameters.AddWithValue("@Weight", Abil.Weight);
            command.Parameters.AddWithValue("@MaxWeight", Abil.MaxWeight);
            command.Parameters.AddWithValue("@WearWeight", Abil.WearWeight);
            command.Parameters.AddWithValue("@MaxWearWeight", Abil.MaxWearWeight);
            command.Parameters.AddWithValue("@HandWeight", Abil.HandWeight);
            command.Parameters.AddWithValue("@MaxHandWeight", Abil.MaxHandWeight);
            try
            {
                context.ExecuteNonQuery(command);
            }
            catch
            {
                LogService.Error("[Exception] PlayDataStorage.UpdateRecord");
                throw;
            }
        }

        private void ComparerUserItem(ServerUserItem[] newItems, ServerUserItem[] oldItems, ref ServerUserItem[] chg, ref ServerUserItem[] del)
        {
            for (int i = 0; i < newItems.Length; i++)
            {
                if (oldItems[i] == null)
                {
                    if (newItems[i].MakeIndex > 0 || newItems[i].Index > 0)
                    {
                        chg[i] = newItems[i];
                    }
                    continue;
                }
                if (newItems[i].MakeIndex == 0 && oldItems[i].MakeIndex > 0)
                {
                    del[i] = oldItems[i];
                    continue;
                }
                if (newItems[i].MakeIndex > 0 || newItems[i].MakeIndex > oldItems[i].MakeIndex)
                {
                    chg[i] = newItems[i];//差异化的数据
                    continue;
                }
                if (oldItems[i] == null && newItems[i].MakeIndex > 0)//历史位置没有物品，但是需要保存的位置有物品时，对数据进行更新操作
                {
                    chg[i] = newItems[i];//差异化的数据
                    continue;
                }
                if (oldItems[i].Index == 0 && oldItems[i].MakeIndex == 0 && newItems[i].MakeIndex > 0 && newItems[i].Index > 0)//穿戴位置没有任何数据
                {
                    del[i] = newItems[i];
                }
            }
        }

        private const string ClearUseItemSql = "UPDATE characters_item SET Position = @Position, MakeIndex = 0, StdIndex = 0, Dura = 0, DuraMax = 0 WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position AND MakeIndex = @MakeIndex AND StdIndex = @StdIndex;";
        private const string UpdateUseItemSql = "UPDATE characters_item SET Position = @Position, MakeIndex =@MakeIndex, StdIndex = @StdIndex, Dura = @Dura, DuraMax = @DuraMax WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position;";
        private const string InsertUseItemSql = "INSERT INTO characters_item (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) VALUES (@PlayerId,@Position,@MakeIndex,@StdIndex,@Dura,@DuraMax);";

        private void SaveItem(StorageContext context, int playerId, ServerUserItem[] userItems)
        {
            if (userItems == null || userItems.Length != 13) throw new InvalidOperationException("The worn item snapshot must contain 13 positions.");
            int useSize = userItems.Length;
            ServerUserItem[] oldItems = ReadItemSlotsForSave(context, playerId, "characters_item", 13, out long[] rowIds, true);
            int useItemCount = oldItems.Where(x => x != null).Count(x => x.MakeIndex == 0 && x.Index == 0);
            ServerUserItem[] delItem = new ServerUserItem[useSize];
            ServerUserItem[] chgList = new ServerUserItem[useSize];
            ComparerUserItem(userItems, oldItems, ref chgList, ref delItem);
            try
            {
                if (delItem.Length > 0)
                {
                    for (int i = 0; i < delItem.Length; i++)
                    {
                        if (delItem[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = ClearUseItemSql;
                        command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", delItem[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", delItem[i].Index);
                        context.ExecuteNonQuery(command);
                    }
                }

                if (chgList.Length > 0)
                {
                    for (int i = 0; i < chgList.Length; i++)
                    {
                        if (chgList[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = rowIds[i] == 0 ? InsertUseItemSql : UpdateUseItemSql;
                        if (rowIds[i] > 0) command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", chgList[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", chgList[i].Index);
                        command.Parameters.AddWithValue("@Dura", chgList[i].Dura);
                        command.Parameters.AddWithValue("@DuraMax", chgList[i].DuraMax);
                        context.ExecuteNonQuery(command);
                    }
                }
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.SaveItem");
                LogService.Error(ex.StackTrace);
                throw;
            }
        }

        private const string ClearBagItemSql = "UPDATE characters_bagitem SET Position = @Position, MakeIndex = 0, StdIndex = 0, Dura = 0, DuraMax = 0 WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position AND MakeIndex = @MakeIndex AND StdIndex = @StdIndex;";
        private const string UpdateBagItemSql = "UPDATE characters_bagitem SET Position = @Position, MakeIndex =@MakeIndex, StdIndex = @StdIndex, Dura = @Dura, DuraMax = @DuraMax WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position;";
        private const string InsertBagSlotSql = "INSERT INTO characters_bagitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) VALUES (@PlayerId,@Position,@MakeIndex,@StdIndex,@Dura,@DuraMax);";

        private void SaveBagItem(StorageContext context, int playerId, ServerUserItem[] bagItems)
        {
            if (bagItems == null || bagItems.Length != 46) throw new InvalidOperationException("The bag item snapshot must contain 46 positions.");
            try
            {
                ServerUserItem[] oldItems = ReadItemSlotsForSave(context, playerId, "characters_bagitem", 46, out long[] rowIds, true);
                int bagSize = bagItems.Length;
                ServerUserItem[] newItems = bagItems;
                ServerUserItem[] delItem = new ServerUserItem[bagSize];
                ServerUserItem[] chgList = new ServerUserItem[bagSize];
                ComparerUserItem(newItems, oldItems, ref chgList, ref delItem);
                if (delItem.Length > 0)
                {
                    for (int i = 0; i < delItem.Length; i++)
                    {
                        if (delItem[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = ClearBagItemSql;
                        command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", delItem[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", delItem[i].Index);
                        context.ExecuteNonQuery(command);
                    }
                }
                if (chgList.Length > 0)
                {
                    for (int i = 0; i < chgList.Length; i++)
                    {
                        if (chgList[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = rowIds[i] == 0 ? InsertBagSlotSql : UpdateBagItemSql;
                        if (rowIds[i] > 0) command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", chgList[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", chgList[i].Index);
                        command.Parameters.AddWithValue("@Dura", chgList[i].Dura);
                        command.Parameters.AddWithValue("@DuraMax", chgList[i].DuraMax);
                        context.ExecuteNonQuery(command);
                    }
                }
            }
            catch
            {
                LogService.Error("[Exception] PlayDataStorage.UpdateBagItem");
                throw;
            }
        }

        private const string ClearStorageItemSql = "UPDATE characters_storageitem SET Position = @Position, MakeIndex = 0, StdIndex = 0, Dura = 0, DuraMax = 0 WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position AND MakeIndex = @MakeIndex AND StdIndex = @StdIndex;";
        private const string UpdateStorageItemSql = "UPDATE characters_storageitem SET Position = @Position, MakeIndex =@MakeIndex, StdIndex = @StdIndex, Dura = @Dura, DuraMax = @DuraMax WHERE Id=@RowId AND PlayerId = @PlayerId AND Position = @Position;";
        private const string InsertStorageSlotSql = "INSERT INTO characters_storageitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) VALUES (@PlayerId,@Position,@MakeIndex,@StdIndex,@Dura,@DuraMax);";

        private void SaveStorageItem(StorageContext context, int playerId, ServerUserItem[] storageItems)
        {
            if (storageItems == null || storageItems.Length != 50) throw new InvalidOperationException("The storage item snapshot must contain 50 positions.");
            try
            {
                int storageSize = storageItems.Length;
                ServerUserItem[] oldItems = ReadItemSlotsForSave(context, playerId, "characters_storageitem", 50, out long[] rowIds, true);
                ServerUserItem[] newItems = storageItems;
                ServerUserItem[] delItem = new ServerUserItem[storageSize];
                ServerUserItem[] chgList = new ServerUserItem[storageSize];
                ComparerUserItem(newItems, oldItems, ref chgList, ref delItem);
                if (delItem.Length > 0)
                {
                    for (int i = 0; i < delItem.Length; i++)
                    {
                        if (delItem[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = ClearStorageItemSql;
                        command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", delItem[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", delItem[i].Index);
                        context.ExecuteNonQuery(command);
                    }
                }

                if (chgList.Length > 0)
                {
                    for (int i = 0; i < chgList.Length; i++)
                    {
                        if (chgList[i] == null)
                        {
                            continue;
                        }
                        MySqlConnector.MySqlCommand command = context.CreateCommand();
                        command.CommandText = rowIds[i] == 0 ? InsertStorageSlotSql : UpdateStorageItemSql;
                        if (rowIds[i] > 0) command.Parameters.AddWithValue("@RowId", rowIds[i]);
                        command.Parameters.AddWithValue("@PlayerId", playerId);
                        command.Parameters.AddWithValue("@Position", i);
                        command.Parameters.AddWithValue("@MakeIndex", chgList[i].MakeIndex);
                        command.Parameters.AddWithValue("@StdIndex", chgList[i].Index);
                        command.Parameters.AddWithValue("@Dura", chgList[i].Dura);
                        command.Parameters.AddWithValue("@DuraMax", chgList[i].DuraMax);
                        context.ExecuteNonQuery(command);
                    }
                }
            }
            catch
            {
                LogService.Error("[Exception] PlayDataStorage.SaveStorageItem");
                throw;
            }
        }

        private void SaveMagics(StorageContext context, int playerId, MagicRcd[] humanRcd)
        {
            MySqlConnector.MySqlCommand delcommand = context.CreateCommand();
            delcommand.CommandText = "DELETE FROM characters_magic WHERE PlayerId=@PlayerId";
            delcommand.Parameters.AddWithValue("@PlayerId", playerId);
            context.ExecuteNonQuery(delcommand);
            try
            {
                const string sStrSql = "INSERT INTO characters_magic(PlayerId,MagicId,Level,Usekey,CurrTrain) VALUES ({0},{1},{2},'{3}',{4});";
                List<string> strSqlList = new List<string>();
                for (int i = 0; i < humanRcd.Length; i++)
                {
                    if (humanRcd[i].MagIdx > 0)
                    {
                        strSqlList.Add(string.Format(sStrSql, playerId, humanRcd[i].MagIdx, humanRcd[i].Level, humanRcd[i].MagicKey, humanRcd[i].TranPoint));
                    }
                }
                if (strSqlList.Count <= 0)
                {
                    return;
                }
                MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = string.Join("\r\n", strSqlList);
                context.ExecuteNonQuery(command);
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.SaveMagics");
                LogService.Error(ex.StackTrace);
                throw;
            }
        }

        private void SaveBonusability(StorageContext context, int playerId, NakedAbility bonusAbil)
        {
            const string sSqlStr = "INSERT INTO characters_bonusability (PlayerId,AC,MAC,DC,MC,SC,HP,MP,HIT,SPEED,RESERVED) VALUES (@PlayerId,@AC,@MAC,@DC,@MC,@SC,@HP,@MP,@HIT,@SPEED,@RESERVED) ON DUPLICATE KEY UPDATE AC=@AC,MAC=@MAC,DC=@DC,MC=@MC,SC=@SC,HP=@HP,MP=@MP,HIT=@HIT,SPEED=@SPEED,RESERVED=@RESERVED";
            try
            {
                MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = sSqlStr;
                command.Parameters.AddWithValue("@PlayerId", playerId);
                command.Parameters.AddWithValue("@AC", bonusAbil.AC);
                command.Parameters.AddWithValue("@MAC", bonusAbil.MAC);
                command.Parameters.AddWithValue("@DC", bonusAbil.DC);
                command.Parameters.AddWithValue("@MC", bonusAbil.MC);
                command.Parameters.AddWithValue("@SC", bonusAbil.SC);
                command.Parameters.AddWithValue("@HP", bonusAbil.HP);
                command.Parameters.AddWithValue("@MP", bonusAbil.MP);
                command.Parameters.AddWithValue("@HIT", bonusAbil.Hit);
                command.Parameters.AddWithValue("@SPEED", bonusAbil.Speed);
                command.Parameters.AddWithValue("@RESERVED", bonusAbil.Reserved);
                context.ExecuteNonQuery(command);
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.SaveBonusability");
                LogService.Error(ex.StackTrace);
                throw;
            }
        }

        private void SaveQuest(StorageContext context, int id, CharacterData data)
        {
            const string deleteSql = "DELETE FROM characters_quest WHERE PlayerId=@PlayerId";
            try
            {
                using (MySqlConnector.MySqlCommand delete = context.CreateCommand())
                {
                    delete.CommandText = deleteSql;
                    delete.Parameters.AddWithValue("@PlayerId", id);
                    context.ExecuteNonQuery(delete);
                }
                const string insertSql = "INSERT INTO characters_quest (PLAYERID, QUESTOPENINDEX, QUESTFININDEX, QUEST) VALUES (@PlayerId, @QuestOpen, @QuestFlag, @QuestUnit)";
                using MySqlConnector.MySqlCommand insert = context.CreateCommand();
                insert.CommandText = insertSql;
                insert.Parameters.AddWithValue("@PlayerId", id);
                insert.Parameters.AddWithValue("@QuestOpen", EncodeQuestBytes(data.QuestUnitOpen));
                insert.Parameters.AddWithValue("@QuestFlag", EncodeQuestBytes(data.QuestFlag));
                insert.Parameters.AddWithValue("@QuestUnit", EncodeQuestBytes(data.QuestUnit));
                context.ExecuteNonQuery(insert);
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.SaveQuest: " + ex.Message);
                throw;
            }
        }

        private static string EncodeQuestBytes(byte[] value)
            => Convert.ToBase64String(value is { Length: 128 } ? value : new byte[128]);

        private void SaveStatus(StorageContext context, int playerId, ushort[] statusTimeArr)
        {
            try
            {
                const string updatrStatusSql = "UPDATE characters_status SET Status0=@Status0,Status1=@Status1,Status2=@Status2,Status3=@Status3,Status4=@Status4,Status5=@Status5,Status6=@Status6,Status7=@Status7,Status8=@Status8,Status9=@Status9,Status10=@Status10,Status11=@Status11,Status12=@Status12,Status13=@Status13,Status14=@Status14 WHERE PlayerId=@PlayerId;";
                MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = updatrStatusSql;
                command.Parameters.AddWithValue("@PlayerId", playerId);
                command.Parameters.AddWithValue("@Status0", statusTimeArr[0]);
                command.Parameters.AddWithValue("@Status1", statusTimeArr[1]);
                command.Parameters.AddWithValue("@Status2", statusTimeArr[2]);
                command.Parameters.AddWithValue("@Status3", statusTimeArr[3]);
                command.Parameters.AddWithValue("@Status4", statusTimeArr[4]);
                command.Parameters.AddWithValue("@Status5", statusTimeArr[5]);
                command.Parameters.AddWithValue("@Status6", statusTimeArr[6]);
                command.Parameters.AddWithValue("@Status7", statusTimeArr[7]);
                command.Parameters.AddWithValue("@Status8", statusTimeArr[8]);
                command.Parameters.AddWithValue("@Status9", statusTimeArr[9]);
                command.Parameters.AddWithValue("@Status10", statusTimeArr[10]);
                command.Parameters.AddWithValue("@Status11", statusTimeArr[11]);
                command.Parameters.AddWithValue("@Status12", statusTimeArr[12]);
                command.Parameters.AddWithValue("@Status13", statusTimeArr[13]);
                command.Parameters.AddWithValue("@Status14", statusTimeArr[14]);
                context.ExecuteNonQuery(command);
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.UpdateStatus (Update characters_status)");
                LogService.Error(ex.StackTrace);
                throw;
            }
        }

        // Equipment can move between worn, bag and storage slots during one save. Reconcile
        // instance attributes only after all three slot tables have been updated, in the
        // same transaction, so moving an item cannot erase its bonus.
        private void ReplaceItemAttrs(StorageContext context, int playerId,
            ServerUserItem[] wornItems, ServerUserItem[] bagItems, ServerUserItem[] storageItems)
        {
            using (MySqlConnector.MySqlCommand delete = context.CreateCommand())
            {
                delete.CommandText = "DELETE FROM characters_item_attr WHERE PlayerId=@PlayerId";
                delete.Parameters.AddWithValue("@PlayerId", playerId);
                context.ExecuteNonQuery(delete);
            }

            IEnumerable<ServerUserItem> items = wornItems.Concat(bagItems).Concat(storageItems)
                .Where(item => item != null && item.MakeIndex > 0 && item.Index > 0
                    && item.Desc != null && item.Desc.Any(value => value != 0))
                .DistinctBy(item => item.MakeIndex);
            foreach (ServerUserItem item in items)
            {
                using MySqlConnector.MySqlCommand insert = context.CreateCommand();
                insert.CommandText = "INSERT INTO characters_item_attr "
                    + "(PlayerId,MakeIndex,VALUE0,VALUE1,VALUE2,VALUE3,VALUE4,VALUE5,VALUE6,VALUE7,VALUE8,VALUE9,VALUE10,VALUE11,VALUE12,VALUE13) "
                    + "VALUES (@PlayerId,@MakeIndex,@Value0,@Value1,@Value2,@Value3,@Value4,@Value5,@Value6,@Value7,@Value8,@Value9,@Value10,@Value11,@Value12,@Value13)";
                insert.Parameters.AddWithValue("@PlayerId", playerId);
                insert.Parameters.AddWithValue("@MakeIndex", item.MakeIndex);
                for (int index = 0; index < 14; index++)
                {
                    insert.Parameters.AddWithValue("@Value" + index, item.Desc[index]);
                }
                context.ExecuteNonQuery(insert);
            }
        }

        private bool UpdateChrRecord(int playerId, QueryChr queryChrRcd)
        {
            const string sStrString = "UPDATE characters SET Sex=@Sex, Job=@Job WHERE ID=@Id";
            using StorageContext context = new StorageContext(_storageOption);
            bool success = false;
            context.Open(ref success);
            if (!success)
            {
                return false;
            }
            bool result = false;
            try
            {
                try
                {
                    MySqlConnector.MySqlCommand command = context.CreateCommand();
                    command.CommandText = sStrString;
                    command.Parameters.AddWithValue("@Sex", queryChrRcd.Sex);
                    command.Parameters.AddWithValue("@Job", queryChrRcd.Job);
                    command.Parameters.AddWithValue("@Id", playerId);
                    command.ExecuteNonQuery();
                    result = true;
                }
                catch
                {
                    LogService.Error("[Exception] UpdateChrRecord");
                    result = false;
                }
            }
            finally
            {
                context.Dispose();
            }
            return result;
        }

        private void DeleteItemAttr(StorageContext context, int playerId, IEnumerable<int> makeIndex)
        {
            try
            {
                MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = "DELETE FROM characters_item_attr WHERE PlayerId=@PlayerId AND MakeIndex in (@MakeIndex)";
                command.Parameters.AddWithValue("@PlayerId", playerId);
                command.Parameters.AddWithValue("@MakeIndex", string.Join(",", makeIndex));
                command.ExecuteNonQuery();
            }
            catch (Exception e)
            {
                LogService.Error("[Exception] PlayDataStorage.UpdateRecord (Delete item attr)");
                LogService.Error(e.StackTrace);
            }
        }

        private void ClearItemAttr(StorageContext context, int playerId, IList<int> makeIndex)
        {
            if (!makeIndex.Any())
            {
                return;
            }
            const string clearItemAttrSql = "UPDATE characters_item_attr SET MakeIndex=0,VALUE0=0,VALUE1=0,VALUE2=0,VALUE3=0,VALUE4=0,VALUE5=0,VALUE6=0,VALUE7=0,VALUE8=0,VALUE9=0,VALUE10=0,VALUE11=0,VALUE12=0,VALUE13=0 WHERE PlayerId={0} AND MakeIndex ={1};";
            try
            {
                List<string> strSqlList = new List<string>();
                for (int i = 0; i < makeIndex.Count(); i++)
                {
                    strSqlList.Add(string.Format(clearItemAttrSql, playerId, makeIndex[i]));
                }
                MySqlConnector.MySqlCommand command = context.CreateCommand();
                command.CommandText = string.Join("\r\n", strSqlList);
                command.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                LogService.Error("[Exception] PlayDataStorage.ClearItemAttr");
                LogService.Error(ex.StackTrace);
            }
        }

    }
}
