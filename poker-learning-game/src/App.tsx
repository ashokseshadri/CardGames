import { useEffect, useMemo, useRef, useState } from 'react'
import { CareerDashboard } from './components/CareerDashboard'
import { PokerTrainerView } from './components/PokerTrainerView'
import { CAREER_ROUND_CHIPS, type CareerMode } from './career/contracts'
import { useCareer } from './career/useCareer'
import { usePokerTrainer } from './hooks/usePokerTrainer'
import './styles/poker.css'

export default function App() {
  const trainer = usePokerTrainer()
  const [mode, setMode] = useState<CareerMode>(() => {
    try { return localStorage.getItem('poker-study-mode') === 'career' ? 'career' : 'practice' } catch { return 'practice' }
  })
  const career = useCareer({ mode })
  const settlementAttempts = useRef(new Set<string>())
  const careerNeedsFreshHand = useRef(mode === 'career')
  const handSettled = useMemo(
    () => Boolean(career.snapshot?.story.some((entry) => entry.handId === trainer.state.handId)),
    [career.snapshot, trainer.state.handId],
  )
  const availableCareerChips = career.snapshot?.availableChips ?? 0
  const funded = availableCareerChips > 0
  const careerTableStack = Math.min(CAREER_ROUND_CHIPS, Math.max(1, Math.floor(availableCareerChips)))

  useEffect(() => {
    if (mode !== 'career' || !career.snapshot || !careerNeedsFreshHand.current) return
    careerNeedsFreshHand.current = false
    trainer.newHand(funded ? careerTableStack : CAREER_ROUND_CHIPS)
  }, [career.snapshot, careerTableStack, funded, mode, trainer])

  useEffect(() => {
    if (mode !== 'career' || trainer.state.phase !== 'complete' || !trainer.showdownResult || trainer.state.heroNet === null || career.operation !== null) return
    if (settlementAttempts.current.has(trainer.state.handId) || handSettled) return
    settlementAttempts.current.add(trainer.state.handId)
    void career.settleRound(trainer.state.handId, trainer.showdownResult, trainer.state.heroNet, trainer.state.startingStack)
  }, [career, handSettled, mode, trainer.showdownResult, trainer.state.handId, trainer.state.heroNet, trainer.state.phase, trainer.state.startingStack])

  const changeMode = (nextMode: CareerMode) => {
    setMode(nextMode)
    try { localStorage.setItem('poker-study-mode', nextMode) } catch { /* SQLite remains authoritative. */ }
    if (nextMode === 'career' && mode !== 'career') careerNeedsFreshHand.current = true
  }

  const retryCareer = () => {
    if (mode === 'career' && trainer.state.phase === 'complete' && trainer.showdownResult && trainer.state.heroNet !== null && !handSettled) {
      settlementAttempts.current.delete(trainer.state.handId)
      void career.settleRound(trainer.state.handId, trainer.showdownResult, trainer.state.heroNet, trainer.state.startingStack)
      return
    }
    void career.retry()
  }

  const canStartCareerHand = mode !== 'career' || (
    trainer.state.phase === 'complete' && handSettled && funded && career.operation === null
  )
  const careerStatus = mode !== 'career'
    ? undefined
    : !career.snapshot
      ? 'Loading the local career ledger before play.'
      : !funded
        ? 'Your balance is zero. Borrow 100 fictional chips to start another career hand.'
        : trainer.state.phase === 'complete' && !handSettled
          ? 'Recording this result in the local SQLite career story.'
          : trainer.state.phase !== 'complete'
            ? `Play this ${trainer.state.startingStack}-chip table stack to a completed hand before starting another.`
            : undefined

  return (
    <PokerTrainerView
      state={trainer.state}
      analysis={trainer.analysis}
      difficulty={trainer.difficulty}
      isAnalyzing={trainer.isAnalyzing}
      legalActions={mode === 'career' && (!funded || career.operation !== null) ? null : trainer.legalActions}
      onAction={trainer.act}
      isBotActing={trainer.isBotActing}
      turnStatus={trainer.turnStatus}
      onNewHand={() => trainer.newHand(mode === 'career' ? careerTableStack : CAREER_ROUND_CHIPS)}
      onPlayerCountChange={(count) => {
        if (mode !== 'career' || canStartCareerHand) trainer.setPlayerCount(count, mode === 'career' ? careerTableStack : CAREER_ROUND_CHIPS)
      }}
      onDifficultyChange={trainer.setDifficulty}
      canStartNewHand={canStartCareerHand}
      playerCountLocked={mode === 'career' && !canStartCareerHand}
      controlStatus={careerStatus}
      careerPanel={<CareerDashboard
        mode={mode}
        snapshot={career.snapshot}
        operation={career.operation}
        error={career.error}
        onModeChange={changeMode}
        onBorrow={career.borrow}
        onRepay={career.repay}
        onRetry={retryCareer}
        canRepayNow={trainer.state.phase === 'complete' && handSettled}
        modeChangeLocked={mode === 'career' && funded && !handSettled}
      />}
    />
  )
}
