using OpenMir2;
using OpenMir2.Consts;
using SystemModule.Actors;

namespace M2Server.Monster.Monsters
{
    public class ScultureMonster : MonsterObject
    {
        public ScultureMonster() : base()
        {
            SearchTime = M2Share.RandomNumber.Random(1500) + 1500;
            ViewRange = 7;
            StoneMode = true;
            CharStatusEx = PoisonState.STONEMODE;
        }

        private void MeltStone(IActor trigger)
        {
            StoneMode = false;
            CharStatusEx &= ~PoisonState.STONEMODE;
            CharStatus = GetCharStatus();
            SendRefMsg(Messages.RM_DIGUP, Dir, CurrX, CurrY, 0, "");
            if (IsCombatTarget(trigger, ChaseRange))
            {
                UpdateVisibleGay(trigger);
                SetTargetCreat(trigger);
            }
        }

        private void MeltStoneAll(IActor trigger)
        {
            MeltStone(trigger);
            IList<IActor> objectList = new List<IActor>();
            GetMapBaseObjects(Envir, CurrX, CurrY, 7, ref objectList);
            for (int i = 0; i < objectList.Count; i++)
            {
                IActor baseObject = objectList[i];
                if (baseObject.StoneMode && !baseObject.Death && !baseObject.Ghost)
                {
                    if (baseObject is ScultureMonster)
                    {
                        ((ScultureMonster)baseObject).MeltStone(trigger);
                    }
                }
            }
        }

        public override void Run()
        {
            if (CanMove() && (HUtil32.GetTickCount() - WalkTick) >= WalkSpeed)
            {
                if (StoneMode)
                {
                    for (int i = 0; i < VisibleActors.Count; i++)
                    {
                        IActor baseObject = VisibleActors[i].BaseObject;
                        if (IsCombatTarget(baseObject, 2))
                        {
                            MeltStoneAll(baseObject);
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
                    }
                }
            }
            base.Run();
        }
    }
}
