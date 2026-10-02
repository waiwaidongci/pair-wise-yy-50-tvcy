import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type Proof = { id: string; round: number; date: string; sample: string; deltaE: number; feedback: string; correction: string; owner: string; decision: '待决定' | '通过' | '退回'; revision: string; approvedRevision?: string | null }
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断' | '待确认'; updatedAt: string; resumable: boolean; revision: string; fingerprint: string; shardsTotal: number; shardsDone: number }
export type Snapshot = { revision: string; lockedAt: string; pages: Page[]; positions: Position[]; validations: Validation[]; fingerprint: string }
export type Release = { revision: string; proofId: string; proofsFingerprint: string; grantedAt: string }

export const sheetSpec = {
  width: 720,
  height: 1020,
  bleed: 3,
  safe: 5,
  gutter: 6,
  binding: '骑马订',
  grain: '纵向',
}

const seedPages: Page[] = [
  { pageNo: 1, name: '封面', width: 210, height: 297, bleed: 3, content: '潮汐来信 / 节目册' },
  { pageNo: 2, name: '版权页', width: 210, height: 297, bleed: 2, content: '版权与演职人员' },
  { pageNo: 3, name: '序言', width: 210, height: 297, bleed: 3, content: '导演手记' },
  { pageNo: 4, name: '剧照跨页左', width: 210, height: 297, bleed: 3, content: '第一幕剧照' },
  { pageNo: 5, name: '剧照跨页右', width: 210, height: 297, bleed: 3, content: '第一幕剧照延伸' },
  { pageNo: 6, name: '曲目表', width: 210, height: 297, bleed: 3, content: '曲目与时长' },
  { pageNo: 7, name: '创作团队', width: 210, height: 297, bleed: 1, content: '主创与制作团队' },
  { pageNo: 8, name: '封底', width: 210, height: 297, bleed: 3, content: '巡演信息' },
]

const seedPositions: Position[] = [
  { id: 'P-01', pageNo: 8, x: 34, y: 44, rotation: 0, front: true },
  { id: 'P-02', pageNo: 1, x: 372, y: 44, rotation: 180, front: true },
  { id: 'P-03', pageNo: 6, x: 34, y: 548, rotation: 180, front: true },
  { id: 'P-04', pageNo: 3, x: 372, y: 548, rotation: 0, front: true },
  { id: 'P-05', pageNo: 2, x: 34, y: 44, rotation: 0, front: false },
  { id: 'P-06', pageNo: 7, x: 372, y: 44, rotation: 180, front: false },
  { id: 'P-07', pageNo: 4, x: 34, y: 548, rotation: 0, front: false },
  { id: 'P-08', pageNo: 5, x: 372, y: 548, rotation: 180, front: false },
]

const seedProofs: Proof[] = [
  { id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理', decision: '退回', revision: 'R4', approvedRevision: null },
  { id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。', owner: '林青 / 拼版', decision: '待决定', revision: 'R5', approvedRevision: null },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 75, status: '已中断', updatedAt: '09-25 16:42', resumable: true, revision: 'R5', fingerprint: '', shardsTotal: 8, shardsDone: 6 },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false, revision: 'R5', fingerprint: '', shardsTotal: 8, shardsDone: 8 },
]

function now() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function fingerprintOf(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

function computeValidations(pages: Page[], positions: Position[]): Validation[] {
  const issues: Validation[] = []
  const placedPages = positions.map((position) => position.pageNo)
  pages.forEach((page) => {
    if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
    if (page.bleed < sheetSpec.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${sheetSpec.bleed}mm。` })
  })
  for (let index = 0; index < positions.length; index += 1) {
    for (let next = index + 1; next < positions.length; next += 1) {
      const a = positions[index]
      const b = positions[next]
      if (a.front === b.front && Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 430) {
        issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
      }
    }
  }
  const frontOrder = positions.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
  if (frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: '骑马订正版页序需要复核', detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
  return issues
}

function makeSnapshot(revision: string, pages: Page[], positions: Position[]): Snapshot {
  const validations = computeValidations(pages, positions)
  return {
    revision,
    lockedAt: now(),
    pages: clone(pages),
    positions: clone(positions),
    validations,
    fingerprint: fingerprintOf({ pages, positions, validations }),
  }
}

export const useImpositionStore = defineStore('imposition', () => {
  const saved = localStorage.getItem('print-imposition-v2')
  const restored = saved ? JSON.parse(saved) : null
  const pages = ref<Page[]>(restored?.pages ?? clone(seedPages))
  const positions = ref<Position[]>(restored?.positions ?? clone(seedPositions))
  const proofs = ref<Proof[]>(restored?.proofs ?? clone(seedProofs))
  const tasks = ref<ExportTask[]>(restored?.tasks ?? clone(seedTasks))
  const snapshots = ref<Record<string, Snapshot>>(restored?.snapshots ?? {})
  const lockedSnapshot = ref<Snapshot | null>(restored?.lockedSnapshot ?? null)
  const release = ref<Release | null>(restored?.release ?? null)
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(restored?.revision ?? 'R6')
  const locked = ref(restored?.locked ?? false)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  const validations = computed<Validation[]>(() => computeValidations(pages.value, positions.value))

  if (!restored) {
    // 历史基线 R5：既有导出任务绑定在这份只读快照上，恢复时按它取内容。
    const baseline = makeSnapshot('R5', pages.value, positions.value)
    baseline.lockedAt = '09-25 15:40'
    snapshots.value = { R5: baseline }
    tasks.value.forEach((task) => {
      task.revision = 'R5'
      task.fingerprint = baseline.fingerprint
    })
  }

  // 刷新或重启会打断生成中的任务：保留已完成分片，降级为可恢复的已中断。
  tasks.value.forEach((task) => {
    if (task.status === '生成中') task.status = '已中断'
  })

  const contentFingerprint = computed(() => fingerprintOf({ pages: pages.value, positions: positions.value, validations: validations.value }))
  const contentIntact = computed(() => !!lockedSnapshot.value && contentFingerprint.value === lockedSnapshot.value.fingerprint)
  const releaseValid = computed(() => locked.value && !!release.value && !!lockedSnapshot.value && release.value.revision === lockedSnapshot.value.revision && contentIntact.value)

  const runners = new Map<string, ReturnType<typeof setInterval>>()

  function stopRunner(id: string) {
    const timer = runners.get(id)
    if (timer) {
      clearInterval(timer)
      runners.delete(id)
    }
  }

  function startRunner(id: string) {
    if (runners.has(id)) return
    const timer = setInterval(() => {
      const task = tasks.value.find((item) => item.id === id)
      if (!task || task.status !== '生成中') {
        stopRunner(id)
        return
      }
      task.shardsDone = Math.min(task.shardsTotal, task.shardsDone + 1)
      task.progress = Math.round((task.shardsDone / task.shardsTotal) * 100)
      task.updatedAt = now()
      if (task.shardsDone >= task.shardsTotal) {
        task.status = '已完成'
        task.resumable = false
        stopRunner(id)
      }
    }, 450)
    runners.set(id, timer)
  }

  // 放行一旦失效（改版面、补录打样、解锁），排队/生成中/已中断的导出全部停下等重新确认。
  // 在各个失效入口同步调用，watch 作为兜底，不依赖异步刷新时机。
  function enforceExportHold() {
    if (releaseValid.value) return
    tasks.value.forEach((task) => {
      if (task.status === '排队中' || task.status === '生成中' || task.status === '已中断') {
        task.status = '待确认'
        stopRunner(task.id)
      }
    })
  }

  watch(releaseValid, enforceExportHold, { immediate: true })

  // 放行之后任何打样补录或修改都会让打样指纹失配，原放行自动失效。
  watch(proofs, () => {
    if (release.value && fingerprintOf(proofs.value) !== release.value.proofsFingerprint) {
      release.value = null
      enforceExportHold()
    }
  }, { deep: true })

  watch([pages, positions, proofs, tasks, revision, locked, snapshots, lockedSnapshot, release], () => {
    localStorage.setItem('print-imposition-v2', JSON.stringify({
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      snapshots: snapshots.value,
      lockedSnapshot: lockedSnapshot.value,
      release: release.value,
      revision: revision.value,
      locked: locked.value,
    }))
  }, { deep: true })

  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: 34, y: 44, rotation: 0, front: side.value === 'front' })
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return
    Object.assign(proof, patch)
    if (patch.decision === '通过') {
      // 打样通过必须对得上当前锁定快照：未锁定或锁定后内容被改动时不形成放行。
      if (locked.value && lockedSnapshot.value && contentIntact.value) {
        proof.approvedRevision = lockedSnapshot.value.revision
        release.value = { revision: lockedSnapshot.value.revision, proofId: proof.id, proofsFingerprint: fingerprintOf(proofs.value), grantedAt: now() }
      } else {
        proof.approvedRevision = null
      }
    } else if (patch.decision) {
      proof.approvedRevision = null
    }
  }

  function createProof() {
    proofs.value.push({ id: `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`, round: proofs.value.length + 1, date: new Date().toISOString().slice(0, 10), sample: `数字样张 v${proofs.value.length + 1}`, deltaE: 0, feedback: '', correction: '', owner: '当前用户', decision: '待决定', revision: revision.value, approvedRevision: null })
  }

  function lockBaseline() {
    if (locked.value) return
    revision.value = `R${Number(revision.value.slice(1)) + 1}`
    const snapshot = makeSnapshot(revision.value, pages.value, positions.value)
    snapshots.value[snapshot.revision] = snapshot
    lockedSnapshot.value = snapshot
    locked.value = true
    release.value = null
    enforceExportHold()
  }

  function unlock() {
    locked.value = false
    enforceExportHold()
  }

  function createTask() {
    if (!releaseValid.value || !lockedSnapshot.value) return null
    const snapshot = lockedSnapshot.value
    const task: ExportTask = {
      id: `EXP-${Date.now().toString().slice(-6)}`,
      name: '印刷交付包 · PDF/X-4',
      progress: 0,
      status: '排队中',
      updatedAt: now(),
      resumable: true,
      revision: snapshot.revision,
      fingerprint: snapshot.fingerprint,
      shardsTotal: Math.max(1, snapshot.pages.length),
      shardsDone: 0,
    }
    tasks.value.push(task)
    return task
  }

  function confirmTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task || task.status !== '待确认' || !releaseValid.value) return
    task.status = task.shardsDone > 0 ? '已中断' : '排队中'
    task.updatedAt = now()
  }

  function resumeTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task || !task.resumable) return
    // 重复恢复不新增任务、不重启分片；待确认任务必须先重新确认。
    if (task.status === '生成中' || task.status === '已完成' || task.status === '待确认') return
    if (!releaseValid.value) {
      task.status = '待确认'
      return
    }
    // 按任务绑定的原快照恢复，只补未完成分片，不混入新版本内容。
    task.status = '生成中'
    task.updatedAt = now()
    startRunner(id)
  }

  return { pages, positions, proofs, tasks, snapshots, lockedSnapshot, release, side, zoom, revision, locked, selectedPosition, selectedProof, validations, contentIntact, releaseValid, updatePosition, addPosition, updateProof, createProof, lockBaseline, unlock, createTask, confirmTask, resumeTask }
})
