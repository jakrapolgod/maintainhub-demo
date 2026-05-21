'use client'

/**
 * PMScheduleBuilder — five-step wizard for creating (or editing) a PM schedule.
 *
 * Step 1  Basic Info      — title, asset, description
 * Step 2  Trigger Type    — CALENDAR / METER / CONDITION + rule config
 * Step 3  Task List       — drag-to-reorder task cards with inline forms
 * Step 4  Resources       — skills, default assignees
 * Step 5  Review & Save   — summary + AI suggestions modal
 */

import { useState, useCallback }  from 'react'
import { useRouter }              from 'next/navigation'
import { useForm }                from 'react-hook-form'
import { zodResolver }            from '@hookform/resolvers/zod'
import { z }                      from 'zod'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS }         from '@dnd-kit/utilities'
import {
  ChevronLeft, ChevronRight, ArrowLeft, Sparkles, GripVertical,
  Plus, Trash2, Loader2, Camera, Activity, AlertTriangle, CheckCircle,
} from 'lucide-react'
import { format, addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns'
import { toast } from 'sonner'

import { Button }            from '@/components/ui/button'
import { Input }             from '@/components/ui/input'
import { Label }             from '@/components/ui/label'
import { Textarea }          from '@/components/ui/textarea'
import { Badge }             from '@/components/ui/badge'
import { Switch }            from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { useCreatePMSchedule, useSuggestPMSchedules } from '@/hooks/usePMSchedules'
import { useAssets }   from '@/hooks/useAssets'
import type { PMTask, PMFrequency, PMSuggestedSchedule } from '@/lib/api/pm-schedules'

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  assetId:     z.string().min(1, 'Asset is required'),
  title:       z.string().min(1).max(200),
  description: z.string().max(5_000).optional(),
})

type Step1Values = z.infer<typeof step1Schema>

// ── Frequency label ───────────────────────────────────────────────────────────

const FREQ_LABELS: Record<PMFrequency, string> = {
  daily:     'Daily',
  weekly:    'Weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annually:  'Annually',
}

function calcNextDue(frequency: PMFrequency, interval: number): string {
  const base = new Date()
  let next: Date
  switch (frequency) {
    case 'daily':     next = addDays(base, interval);       break
    case 'weekly':    next = addWeeks(base, interval);      break
    case 'monthly':   next = addMonths(base, interval);     break
    case 'quarterly': next = addQuarters(base, interval);   break
    case 'annually':  next = addYears(base, interval);      break
    default:          next = addMonths(base, interval)
  }
  return format(next, 'dd MMM yyyy')
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Basic Info', 'Trigger Type', 'Tasks', 'Resources', 'Review']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
              i < current
                ? 'bg-primary border-primary text-primary-foreground'
                : i === current
                ? 'border-primary text-primary bg-background'
                : 'border-muted text-muted-foreground bg-background'
            }`}>
              {i < current ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-[10px] whitespace-nowrap ${i === current ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-12 mb-4 mx-1 ${i < current ? 'bg-primary' : 'bg-muted'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Sortable task item ────────────────────────────────────────────────────────

interface SortableTaskProps {
  task:     PMTask & { _id: string }
  onUpdate: (id: string, updates: Partial<PMTask>) => void
  onRemove: (id: string) => void
}

function SortableTask({ task, onUpdate, onRemove }: SortableTaskProps) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      {/* Task header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground w-4 shrink-0">{task.sequence}.</span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-sm font-medium truncate"
        >
          {task.title || <span className="text-muted-foreground italic">Untitled task</span>}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {task.requiresPhoto        && <Camera       className="h-3.5 w-3.5 text-blue-500"   aria-label="Requires photo" />}
          {task.requiresMeterReading && <Activity      className="h-3.5 w-3.5 text-purple-500" aria-label="Meter reading" />}
          {task.isCritical           && <AlertTriangle className="h-3.5 w-3.5 text-red-500"   aria-label="Critical" />}
          <span className="text-xs text-muted-foreground ml-1">{task.estimatedMinutes}min</span>
          <Button variant="ghost" size="sm" onClick={() => onRemove(task._id)} className="h-6 w-6 p-0 ml-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          <div>
            <Label className="text-xs">Task title *</Label>
            <Input
              value={task.title}
              onChange={(e) => onUpdate(task._id, { title: e.target.value })}
              className="mt-1 h-8 text-sm"
              placeholder="e.g. Check oil level"
            />
          </div>
          <div>
            <Label className="text-xs">Instructions</Label>
            <Textarea
              value={task.instructions}
              onChange={(e) => onUpdate(task._id, { instructions: e.target.value })}
              className="mt-1 text-sm min-h-20"
              placeholder="Step-by-step procedure..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Est. minutes</Label>
              <Input
                type="number" min={0}
                value={task.estimatedMinutes}
                onChange={(e) => onUpdate(task._id, { estimatedMinutes: Number(e.target.value) })}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id={`photo-${task._id}`}
                  checked={task.requiresPhoto}
                  onCheckedChange={(v) => onUpdate(task._id, { requiresPhoto: v })}
                />
                <Label htmlFor={`photo-${task._id}`} className="text-xs cursor-pointer">Requires photo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`meter-${task._id}`}
                  checked={task.requiresMeterReading}
                  onCheckedChange={(v) => onUpdate(task._id, { requiresMeterReading: v })}
                />
                <Label htmlFor={`meter-${task._id}`} className="text-xs cursor-pointer">Meter reading</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`critical-${task._id}`}
                  checked={task.isCritical}
                  onCheckedChange={(v) => onUpdate(task._id, { isCritical: v })}
                />
                <Label htmlFor={`critical-${task._id}`} className="text-xs cursor-pointer">Critical</Label>
              </div>
            </div>
          </div>
          {task.requiresMeterReading && (
            <div>
              <Label className="text-xs">Meter reading unit</Label>
              <Input
                value={task.meterReadingUnit ?? ''}
                onChange={(e) => onUpdate(task._id, { meterReadingUnit: e.target.value || undefined })}
                className="mt-1 h-8 text-sm"
                placeholder="e.g. RPM, °C, hours"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI Suggestions Modal ──────────────────────────────────────────────────────

interface AISuggestModalProps {
  open:        boolean
  onClose:     () => void
  assetType:   string
  onApply:     (sched: PMSuggestedSchedule) => void
}

function AISuggestModal({ open, onClose, assetType, onApply }: AISuggestModalProps) {
  const suggestMut = useSuggestPMSchedules()

  function handleGenerate() {
    suggestMut.mutate({ assetType })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Schedule Suggestions
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Generating PM schedules for: <strong>{assetType || 'this asset type'}</strong>
        </p>
        {!suggestMut.data && !suggestMut.isPending && (
          <Button onClick={handleGenerate} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" /> Generate Suggestions
          </Button>
        )}
        {suggestMut.isPending && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Asking Claude…</span>
          </div>
        )}
        {suggestMut.data && (
          <div className="space-y-3">
            {suggestMut.data.schedules.map((sched, i) => (
              <Card key={i} className="border-2 hover:border-primary transition-colors">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{sched.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{sched.description}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { onApply(sched); onClose() }}>
                      Use this
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{FREQ_LABELS[sched.frequency]} × {sched.interval}</Badge>
                    <Badge variant="secondary">{sched.tasks.length} tasks</Badge>
                    <Badge variant="secondary">{sched.estimatedHours}h est.</Badge>
                  </div>
                  {sched.rationale && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{sched.rationale}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main builder ──────────────────────────────────────────────────────────────

interface PMScheduleBuilderProps {
  /** When provided, the builder is in edit mode and skips redirect to /new. */
  scheduleId?: string
  initialValues?: Partial<Step1Values & {
    type: 'CALENDAR' | 'METER' | 'CONDITION'
    frequency: PMFrequency; interval: number
    meterField: string; tolerance: number
    tasks: PMTask[]
    skills: string[]; assignees: string[]
  }>
  onSaved?: (id: string) => void
}

export function PMScheduleBuilder({ scheduleId, initialValues, onSaved }: PMScheduleBuilderProps) {
  const router        = useRouter()
  const createMut     = useCreatePMSchedule()
  const [step, setStep] = useState(0)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const { register: reg1, handleSubmit: hs1, watch: w1, setValue: sv1, formState: { errors: e1 } } =
    useForm<Step1Values>({ resolver: zodResolver(step1Schema), defaultValues: {
      assetId:     initialValues?.assetId ?? '',
      title:       initialValues?.title   ?? '',
      description: initialValues?.description,
    }})

  const watchedAssetId = w1('assetId')
  const { data: assetsData } = useAssets({ limit: 500 })
  const selectedAsset = assetsData?.items?.find((a) => a.id === watchedAssetId)

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [pmType,    setPmType]    = useState<'CALENDAR' | 'METER' | 'CONDITION'>(initialValues?.type ?? 'CALENDAR')
  const [frequency, setFrequency] = useState<PMFrequency>(initialValues?.frequency ?? 'monthly')
  const [interval,  setInterval]  = useState(initialValues?.interval  ?? 1)
  const [meterField, setMeterField] = useState(initialValues?.meterField ?? '')
  const [tolerance, setTolerance] = useState(initialValues?.tolerance ?? 10)
  const [advanceDays, setAdvanceDays] = useState(7)

  // ── Step 3 state (task list) ───────────────────────────────────────────────
  let taskIdSeq = 1
  const [tasks, setTasks] = useState<Array<PMTask & { _id: string }>>(
    (initialValues?.tasks ?? []).map((t) => ({ ...t, _id: `task-${taskIdSeq++}` }))
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTasks((prev) => {
      const oldIdx = prev.findIndex((t) => t._id === active.id)
      const newIdx = prev.findIndex((t) => t._id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      return reordered.map((t, i) => ({ ...t, sequence: i + 1 }))
    })
  }

  function addTask() {
    const seq = tasks.length + 1
    setTasks((prev) => [...prev, {
      _id: `task-${Date.now()}`,
      sequence: seq, title: '', instructions: '',
      requiresPhoto: false, requiresMeterReading: false,
      meterReadingUnit: undefined, estimatedMinutes: 30, isCritical: false,
    }])
  }

  const updateTask = useCallback((id: string, updates: Partial<PMTask>) => {
    setTasks((prev) => prev.map((t) => t._id === id ? { ...t, ...updates } : t))
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t._id !== id)
      return next.map((t, i) => ({ ...t, sequence: i + 1 }))
    })
  }, [])

  // ── Step 4 state ──────────────────────────────────────────────────────────
  const [skillInput,    setSkillInput]    = useState('')
  const [skills,        setSkills]        = useState<string[]>(initialValues?.skills ?? [])
  const [assigneeInput, setAssigneeInput] = useState('')
  const [assignees,     setAssignees]     = useState<string[]>(initialValues?.assignees ?? [])

  // ── Apply AI suggestion ───────────────────────────────────────────────────
  function applyAISuggestion(sug: PMSuggestedSchedule) {
    setFrequency(sug.frequency)
    setInterval(sug.interval)
    setAdvanceDays(sug.advanceNoticeDays ?? 7)
    setPmType('CALENDAR')

    setTasks(sug.tasks.map((t) => ({
      ...t,
      _id:             `task-${t.sequence}-${Date.now()}`,
      meterReadingUnit: t.meterReadingUnit,
    })))
    toast.success(`Applied "${sug.title}" suggestions`)
    setStep(2)  // jump to task list step
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleFinish(step1: Step1Values) {
    if (tasks.length === 0) {
      toast.error('Add at least one task before saving')
      setStep(2)
      return
    }

    createMut.mutate({
      assetId:  step1.assetId,
      title:    step1.title,
      type:     pmType,
      ...(step1.description !== undefined && { description: step1.description }),
      taskList:    tasks.map(({ _id: _discard, ...t }) => t),
      estimatedHours: tasks.reduce((s, t) => s + t.estimatedMinutes / 60, 0),
      requiredSkillIds:   skills,
      defaultAssigneeIds: assignees,
      advanceNoticeDays:  advanceDays,
      ...(pmType === 'CALENDAR' && {
        calendarRule: { frequency, interval },
      }),
      ...(pmType === 'METER' && {
        meterRule: { meterField, interval, tolerance },
      }),
    }, {
      onSuccess: (data) => {
        if (onSaved) { onSaved(data.id) }
        else router.push('/pm-schedules')
      },
    })
  }

  const step1Data = w1()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 shrink-0 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{scheduleId ? 'Edit PM Schedule' : 'New PM Schedule'}</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-6 py-4 border-b bg-muted/20 shrink-0 overflow-x-auto">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-auto p-6">
        {/* ── STEP 1: Basic Info ──────────────────────────────────────────── */}
        {step === 0 && (
          <form id="step1-form" onSubmit={hs1((data) => { void data; setStep(1) })}
            className="max-w-lg space-y-4">
            <div>
              <Label htmlFor="assetId">Asset *</Label>
              <Select value={watchedAssetId} onValueChange={(v) => sv1('assetId', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select asset…" />
                </SelectTrigger>
                <SelectContent>
                  {assetsData?.items?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.assetNumber} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {e1.assetId && <p className="text-xs text-destructive mt-1">{e1.assetId.message}</p>}
            </div>

            <div>
              <Label htmlFor="title">Schedule title *</Label>
              <Input id="title" {...reg1('title')} placeholder="e.g. Monthly Bearing Lubrication" className="mt-1" />
              {e1.title && <p className="text-xs text-destructive mt-1">{e1.title.message}</p>}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description" {...reg1('description')}
                placeholder="Describe the purpose of this PM schedule…"
                className="mt-1"
              />
            </div>
          </form>
        )}

        {/* ── STEP 2: Trigger Type ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="max-w-lg space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {(['CALENDAR', 'METER', 'CONDITION'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPmType(t)}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    pmType === t ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium text-sm">{t.charAt(0) + t.slice(1).toLowerCase()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t === 'CALENDAR' && 'Time-based recurrence'}
                    {t === 'METER'    && 'Usage meter threshold'}
                    {t === 'CONDITION' && 'Condition-based trigger'}
                  </div>
                </button>
              ))}
            </div>

            {pmType === 'CALENDAR' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Frequency</Label>
                    <Select value={frequency} onValueChange={(v) => setFrequency(v as PMFrequency)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FREQ_LABELS) as PMFrequency[]).map((f) => (
                          <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Every (interval)</Label>
                    <Input
                      type="number" min={1} max={99}
                      value={interval}
                      onChange={(e) => setInterval(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Advance notice (days)</Label>
                  <Input
                    type="number" min={0} max={90}
                    value={advanceDays}
                    onChange={(e) => setAdvanceDays(Number(e.target.value))}
                    className="mt-1 w-32"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Notify assignees this many days before the due date</p>
                </div>
                {/* Live preview */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
                  <p className="text-blue-700 font-medium">Next due preview</p>
                  <p className="text-blue-600 mt-1">
                    Every {interval > 1 ? `${interval} ` : ''}{FREQ_LABELS[frequency].toLowerCase()} →{' '}
                    <strong>{calcNextDue(frequency, interval)}</strong>
                  </p>
                </div>
              </div>
            )}

            {pmType === 'METER' && (
              <div className="space-y-4">
                <div>
                  <Label>Meter field name</Label>
                  <Input
                    value={meterField}
                    onChange={(e) => setMeterField(e.target.value)}
                    placeholder="e.g. operatingHours"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Trigger every (units)</Label>
                    <Input
                      type="number" min={1}
                      value={interval}
                      onChange={(e) => setInterval(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Tolerance (%)</Label>
                    <Input
                      type="number" min={0} max={100}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm">
                  <p className="text-purple-700">
                    Triggers when <strong>{meterField || 'meter'}</strong> reaches{' '}
                    <strong>{interval}</strong> units (±{tolerance}% window:{' '}
                    {Math.round(interval * (1 - tolerance / 100))}–{interval} units)
                  </p>
                </div>
              </div>
            )}

            {pmType === 'CONDITION' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                Condition-based triggers are configured via sensor integration (coming soon).
                The schedule will be created inactive until conditions are configured.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Task List ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Task checklist</h3>
                <p className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? 's' : ''} · Drag to reorder</p>
              </div>
              <Button size="sm" onClick={addTask}>
                <Plus className="h-4 w-4 mr-1" /> Add Task
              </Button>
            </div>

            {tasks.length === 0 ? (
              <div className="border-2 border-dashed rounded-xl py-12 text-center">
                <p className="text-muted-foreground text-sm">No tasks yet. Add your first task above.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <SortableTask key={task._id} task={task} onUpdate={updateTask} onRemove={removeTask} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}

        {/* ── STEP 4: Resources ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="max-w-lg space-y-6">
            <div>
              <Label>Required skills</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && skillInput.trim()) {
                      e.preventDefault()
                      setSkills((s) => [...s, skillInput.trim()])
                      setSkillInput('')
                    }
                  }}
                  placeholder="Type skill and press Enter"
                />
                <Button
                  variant="outline" size="sm"
                  onClick={() => { if (skillInput.trim()) { setSkills((s) => [...s, skillInput.trim()]); setSkillInput('') } }}
                >
                  Add
                </Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.map((sk) => (
                    <Badge key={sk} variant="secondary" className="gap-1">
                      {sk}
                      <button onClick={() => setSkills((s) => s.filter((x) => x !== sk))} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Default assignees (user IDs)</Label>
              <p className="text-xs text-muted-foreground mb-1">These users will be auto-assigned when a WO is created from this schedule</p>
              <div className="flex gap-2">
                <Input
                  value={assigneeInput}
                  onChange={(e) => setAssigneeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && assigneeInput.trim()) {
                      e.preventDefault()
                      setAssignees((a) => [...a, assigneeInput.trim()])
                      setAssigneeInput('')
                    }
                  }}
                  placeholder="Paste user ID and press Enter"
                />
                <Button
                  variant="outline" size="sm"
                  onClick={() => { if (assigneeInput.trim()) { setAssignees((a) => [...a, assigneeInput.trim()]); setAssigneeInput('') } }}
                >
                  Add
                </Button>
              </div>
              {assignees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {assignees.map((id) => (
                    <Badge key={id} variant="secondary" className="gap-1 font-mono text-xs">
                      {id.slice(0, 12)}…
                      <button onClick={() => setAssignees((a) => a.filter((x) => x !== id))}>×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 5: Review & Save ───────────────────────────────────────── */}
        {step === 4 && (
          <div className="max-w-lg space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Asset"    value={selectedAsset?.name ?? step1Data.assetId} />
                <Row label="Title"    value={step1Data.title ?? '(untitled)'} />
                <Row label="Type"     value={pmType} />
                {pmType === 'CALENDAR' && (
                  <Row label="Frequency" value={`Every ${interval} ${FREQ_LABELS[frequency].toLowerCase()}`} />
                )}
                {pmType === 'METER' && (
                  <Row label="Meter" value={`${meterField} every ${interval} units (±${tolerance}%)`} />
                )}
                <Row label="Tasks"   value={`${tasks.length} tasks`} />
                <Row label="Skills"  value={skills.length > 0 ? skills.join(', ') : '—'} />
                <Row label="Est. duration" value={`${tasks.reduce((s, t) => s + t.estimatedMinutes, 0)} min total`} />
              </CardContent>
            </Card>

            <Button
              variant="outline" className="w-full gap-2"
              onClick={() => setAiModalOpen(true)}
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
              Get AI Suggestions for this asset type
            </Button>
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="border-t bg-background px-6 py-4 shrink-0 flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          step === 0 ? (
            <Button type="submit" form="step1-form">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )
        ) : (
          <Button
            onClick={hs1(handleFinish)}
            disabled={createMut.isPending}
            className="min-w-28"
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Schedule'}
          </Button>
        )}
      </div>

      {/* AI suggestions modal */}
      <AISuggestModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        assetType={selectedAsset?.name ?? step1Data.title ?? ''}
        onApply={applyAISuggestion}
      />
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
