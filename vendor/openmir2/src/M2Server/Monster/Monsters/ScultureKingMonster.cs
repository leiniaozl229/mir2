using OpenMir2;
using OpenMir2.Consts;
using SystemModule;
using SystemModule.Actors;
using SystemModule.MagicEvent;

namespace M2Server.Monster.Monsters
{
    public class ScultureKingMonster : MonsterObject
    {
        private int _mNDangerLevel;
        private readonly IList<IActor> _mSlaveObjectList;

        public ScultureKingMonster() : base()
        {
            SearchTime = M2Share.RandomNumber.Random(1500) + 1500;
            ViewRange = 8;
            StoneMode = true;
            CharStatusEx = PoisonState.STONEMODE;
            Dir = 5;
            _mNDangerLevel = 5;
            _mSlaveObjectList = new List<IActor>();
        }

        private void MeltStone(IActor trigger)
        {
            StoneMode = false;
            CharStatusEx &= ~PoisonState.STONEMODE;
            CharStatus = GetCharStatus();
            SendRefMsg(Messages.RM_DIGUP, Dir, CurrX, CurrY, 0, "");
            UpdateVisibleGay(trigger);
            SetTargetCreat(trigger);
            MapEvent stoneEvent = new MapEvent(Envir, CurrX, CurrY, 6, 5 * 60 * 1000, true);
            SystemShare.EventMgr.AddEvent(stoneEvent);
        }

        private void CallSlave()
        {
            short nX = 0;
            short nY = 0;
            int nCount = M2Share.RandomNumber.Random(6) + 6;
            GetFrontPosition(ref nX, ref nY);
            for (int i = 0; i < nCount; i++)
            {
                if (_mSlaveObjectList.Count >= 30)
                {
                    break;
                }
                IActor baseObject = SystemShare.WorldEngine.RegenMonsterByName(MapName, nX, nY, SystemShare.Config.Zuma[M2Share.RandomNumber.Random(4)]);
                if (baseObject != null)
                {
                    _mSlaveObjectList.Add(baseObject);
                }
            }
        }

        protected override void Attack(IActor targetBaseObject, byte nDir)
        {
            int nPower = GetAttackPower(HUtil32.LoByte(WAbil.DC), Math.Abs(HUtil32.HiByte(WAbil.DC) - HUtil32.LoByte(WAbil.DC)));
            HitMagAttackTarget(targetBaseObject, 0, nPower, true);
        }

        public override void Run()
        {
            if (CanMove() && (HUtil32.GetTickCount() - WalkTick) >= WalkSpeed)
            {
                IActor baseObject;
                if (StoneMode)
                {
                    for (int i = 0; i < VisibleActors.Count; i++)
                    {
                        baseObject = VisibleActors[i].BaseObject;
                        if (IsCombatTarget(baseObject, 2))
                        {
                            MeltStone(baseObject);
                            break;
                        }
                    }
                }
                else
                {
                    if ((HUtil32.GetTickCount() - SearchEnemyTick) > 8000 || (HUtil32.GetTickCount() - SearchEnemyTick) > 1000 && TargetCret == null)
                    {
                        SearchEnemyTick = HUtil32.GetTickCount();
                        SearchTarget();
                        // Cross-multiply: integer division otherwise turns any damage into zero.
                        if (_mNDangerLevel > 1 && WAbil.HP > 0 && WAbil.MaxHP > 0 &&
                            (long)WAbil.HP * 5 <= (long)WAbil.MaxHP * (_mNDangerLevel - 1))
                        {
                            _mNDangerLevel -= 1;
                            CallSlave();
                        }
                        if (WAbil.HP == WAbil.MaxHP)
                        {
                            _mNDangerLevel = 5;
                        }
                    }
                }
                for (int i = _mSlaveObjectList.Count - 1; i >= 0; i--)
                {
                    baseObject = _mSlaveObjectList[i];
                    if (baseObject.Death || baseObject.Ghost)
                    {
                        _mSlaveObjectList.RemoveAt(i);
                    }
                }
            }
            base.Run();
        }
    }
}

