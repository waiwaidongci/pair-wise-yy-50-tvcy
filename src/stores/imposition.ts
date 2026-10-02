import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type Proof = {
  id: string
  round: number
  date: string
  sample: string
  deltaE: number
  feedback: string
  correction: string
  owner: string
  decision: '待决定' | '通过' | '退回'
  /** 该打样结论所放行的只读快照 id；未对版则为 null */
  snapshotId: string | null
  approvedAt: string | null
}
export type ExportShard = { id: string; label: string; done: boolean }
export type ExportTask = {
  id: string
  name: string
  progress: number
  status: '排队中' | '生成中' | '已完成' | '已中断'
  updatedAt: string
  resumable: boolean
  /** 该任务创建时所绑定的只读快照 id，恢复时一律按此快照还原，不读活件 */
  snapshotId: string | null
  snapshotRevision: string | null
  shards: ExportShard[]
  /** 放行失效后任务停下等待重新确认，不再继续推进 */
  blocked: boolean
  blockedReason: string | null
}
/** 锁定时定格的只读版本快照：页面、全部版位、预检结果一次性冻结 */
export type VersionSnapshot = {
  id: string
  revision: string
  lockedAt: string
  pages: Page[]
  positions: Position[]
  validations: Validation[]
  released: boolean
  releasedAt: string | null
  releasedByProofId: string | null
  invalidated: boolean
  invalidatedAt: string | null
  invalidationReason: string | null
}

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
  { id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理', decision: '退回', snapshotId: null, approvedAt: null },
  { id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。', owner: '林青 / 拼版', decision: '待决定', snapshotId: null, approvedAt: null },
]

function buildShards(): ExportShard[] {
  return [
    { id: 'pdf', label: '拼版文件 PDF/X-4', done: false },
    { id: 'hash', label: '页面哈希清单', done: false },
    { id: 'preflight', label: '预检报告 JSON', done: false },
    { id: 'colorbar', label: '色彩控制条', done: false },
    { id: 'proofs', label: '打样审批记录', done: false },
    { id: 'spec', label: '纸张与折手规格', done: false },
    { id: 'fonts', label: '字体嵌入', done: false },
    { id: 'bleed', label: '出血与安全区', done: false },
    { id: 'gutter', label: '折手与装订', done: false },
    { id: 'output', label: '输出校验报告', done: false },
  ]
}

function shardsForProgress(progress: number): ExportShard[] {
  const shards = buildShards()
  const doneCount = Math.round((progress / 100) * shards.length)
  shards.forEach((shard, index) => {
    shard.done = index < doneCount
  })
  return shards
}

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 70, status: '已中断', updatedAt: '09-25 16:42', resumable: true, snapshotId: null, snapshotRevision: null, shards: shardsForProgress(70), blocked: false, blockedReason: null },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false, snapshotId: null, snapshotRevision: null, shards: shardsForProgress(100), blocked: false, blockedReason: null },
]

function bumpRevision(rev: string): string {
  const n = Number(rev.slice(1)) || 0
  return `R${n + 1}`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 深拷贝响应式数据（structuredClone 无法克隆 Vue 的 Proxy，这里数据均为纯 JSON 结构） */
function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 归一化旧版本 localStorage 数据，补齐快照/分片等新字段，避免升级后崩溃 */
function normalizeTasks(raw: unknown): ExportTask[] {
  if (!Array.isArray(raw)) return structuredClone(seedTasks)
  return raw.map((item) => {
    const task = item as Partial<ExportTask>
    const shards = Array.isArray(task.shards) && task.shards.length ? task.shards : shardsForProgress(typeof task.progress === 'number' ? task.progress : 0)
    return {
      id: String(task.id ?? `EXP-${Date.now()}`),
      name: String(task.name ?? '印刷交付包 · PDF/X-4'),
      progress: typeof task.progress === 'number' ? task.progress : 0,
      status: task.status ?? '排队中',
      updatedAt: task.updatedAt ?? '刚刚',
      resumable: task.resumable ?? true,
      snapshotId: task.snapshotId ?? null,
      snapshotRevision: task.snapshotRevision ?? null,
      shards,
      blocked: task.blocked ?? false,
      blockedReason: task.blockedReason ?? null,
    } as ExportTask
  })
}

function normalizeProofs(raw: unknown): Proof[] {
  if (!Array.isArray(raw)) return structuredClone(seedProofs)
  return raw.map((item) => {
    const proof = item as Partial<Proof>
    return {
      id: String(proof.id ?? `PRF-${Date.now()}`),
      round: typeof proof.round === 'number' ? proof.round : 1,
      date: proof.date ?? today(),
      sample: proof.sample ?? '数字样张',
      deltaE: typeof proof.deltaE === 'number' ? proof.deltaE : 0,
      feedback: proof.feedback ?? '',
      correction: proof.correction ?? '',
      owner: proof.owner ?? '当前用户',
      decision: proof.decision ?? '待决定',
      snapshotId: proof.snapshotId ?? null,
      approvedAt: proof.approvedAt ?? null,
    } as Proof
  })
}

export const useImpositionStore = defineStore('imposition', () => {
  const saved = localStorage.getItem('print-imposition-v1')
  const restored = saved ? JSON.parse(saved) : null
  const pages = ref<Page[]>(restored?.pages ?? structuredClone(seedPages))
  const positions = ref<Position[]>(restored?.positions ?? structuredClone(seedPositions))
  const proofs = ref<Proof[]>(normalizeProofs(restored?.proofs))
  const tasks = ref<ExportTask[]>(normalizeTasks(restored?.tasks))
  const snapshots = ref<VersionSnapshot[]>(Array.isArray(restored?.snapshots) ? restored.snapshots : [])
  const currentSnapshotId = ref<string | null>(restored?.currentSnapshotId ?? null)
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(restored?.revision ?? 'R6')
  const locked = ref(restored?.locked ?? false)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  /** 活件实时预检结果（编辑中随页面/版位变动） */
  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const placedPages = positions.value.map((position) => position.pageNo)
    pages.value.forEach((page) => {
      if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      if (page.bleed < sheetSpec.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${sheetSpec.bleed}mm。` })
    })
    for (let index = 0; index < positions.value.length; index += 1) {
      for (let next = index + 1; next < positions.value.length; next += 1) {
        const a = positions.value[index]
        const b = positions.value[next]
        if (a.front === b.front && Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 430) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    const frontOrder = positions.value.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
    if (frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: '骑马订正版页序需要复核', detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
    return issues
  })

  const currentSnapshot = computed<VersionSnapshot | null>(() => snapshots.value.find((item) => item.id === currentSnapshotId.value) ?? null)

  /** 当前快照的放行状态：无快照 / 待放行 / 已放行 / 已失效 */
  const releaseState = computed<'无快照' | '待放行' | '已放行' | '已失效'>(() => {
    const snapshot = currentSnapshot.value
    if (!snapshot) return '无快照'
    if (snapshot.invalidated) return '已失效'
    if (snapshot.released) return '已放行'
    return '待放行'
  })

  const blockedTasks = computed<ExportTask[]>(() => tasks.value.filter((task) => task.blocked))

  watch([pages, positions, proofs, tasks, snapshots, currentSnapshotId, revision, locked], () => {
    localStorage.setItem('print-imposition-v1', JSON.stringify({
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      snapshots: snapshots.value,
      currentSnapshotId: currentSnapshotId.value,
      revision: revision.value,
      locked: locked.value,
    }))
  }, { deep: true })

  function snapshotById(id: string | null): VersionSnapshot | null {
    return id ? snapshots.value.find((item) => item.id === id) ?? null : null
  }

  function blockTasksForSnapshot(snapshotId: string, reason: string) {
    tasks.value.forEach((task) => {
      if (task.snapshotId === snapshotId && task.status !== '已完成') {
        task.blocked = true
        task.blockedReason = reason
        task.status = '已中断'
      }
    })
  }

  function unblockTasksForSnapshot(snapshotId: string) {
    tasks.value.forEach((task) => {
      if (task.snapshotId === snapshotId) {
        task.blocked = false
        task.blockedReason = null
      }
    })
  }

  function releaseCurrentSnapshot(proofId: string) {
    const snapshot = currentSnapshot.value
    if (!snapshot) return
    snapshot.released = true
    snapshot.releasedAt = new Date().toISOString()
    snapshot.releasedByProofId = proofId
    snapshot.invalidated = false
    snapshot.invalidatedAt = null
    snapshot.invalidationReason = null
    unblockTasksForSnapshot(snapshot.id)
  }

  function invalidateCurrentSnapshot(reason: string) {
    const snapshot = currentSnapshot.value
    if (!snapshot || !snapshot.released || snapshot.invalidated) return
    snapshot.invalidated = true
    snapshot.invalidatedAt = new Date().toISOString()
    snapshot.invalidationReason = reason
    blockTasksForSnapshot(snapshot.id, reason)
  }

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
    const wasReleased = !!(currentSnapshot.value?.released && !currentSnapshot.value?.invalidated)
    Object.assign(proof, patch)
    if (patch.decision === '通过') {
      // 打样放行必须对得上当前快照：记录所放行的快照 id
      proof.snapshotId = currentSnapshotId.value
      proof.approvedAt = new Date().toISOString()
      if (currentSnapshotId.value) releaseCurrentSnapshot(proof.id)
    } else if (patch.decision === '退回' || patch.decision === '待决定') {
      proof.snapshotId = null
      proof.approvedAt = null
      if (currentSnapshot.value?.releasedByProofId === proof.id) {
        // 放行被撤回，快照回到待放行
        const snapshot = currentSnapshot.value
        if (snapshot) {
          snapshot.released = false
          snapshot.releasedAt = null
          snapshot.releasedByProofId = null
          blockTasksForSnapshot(snapshot.id, '打样放行被撤回，导出等待重新确认')
        }
      }
    } else if (wasReleased) {
      // 放行后补录或修改打样记录，原放行失效，导出停下等重新确认
      invalidateCurrentSnapshot('打样记录在放行后被补充或修改')
    }
  }

  function createProof() {
    proofs.value.push({
      id: `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`,
      round: proofs.value.length + 1,
      date: today(),
      sample: `数字样张 v${proofs.value.length + 1}`,
      deltaE: 0,
      feedback: '',
      correction: '',
      owner: '当前用户',
      decision: '待决定',
      snapshotId: null,
      approvedAt: null,
    })
    if (currentSnapshot.value?.released && !currentSnapshot.value?.invalidated) {
      invalidateCurrentSnapshot('放行后补录新的打样轮次')
    }
  }

  /** 锁定：把页面、全部版位与预检结果连同当前版本号一起定格为只读快照 */
  function lockBaseline() {
    const nextRevision = bumpRevision(revision.value)
    const snapshot: VersionSnapshot = {
      id: `SNP-${Date.now().toString(36).toUpperCase()}`,
      revision: nextRevision,
      lockedAt: new Date().toISOString(),
      pages: cloneData(pages.value),
      positions: cloneData(positions.value),
      validations: cloneData(validations.value),
      released: false,
      releasedAt: null,
      releasedByProofId: null,
      invalidated: false,
      invalidatedAt: null,
      invalidationReason: null,
    }
    snapshots.value.push(snapshot)
    currentSnapshotId.value = snapshot.id
    revision.value = nextRevision
    locked.value = true
  }

  /** 解锁修订：重新打开基线即暂停原放行，已绑定该快照的导出停下等重新确认 */
  function unlock() {
    if (currentSnapshot.value?.released && !currentSnapshot.value?.invalidated) {
      invalidateCurrentSnapshot('锁定后改版位或页面，原放行失效')
    }
    locked.value = false
  }

  /** 新建交付包：只允许在当前快照已放行时创建，并绑定到该只读快照 */
  function createExportTask(): ExportTask | null {
    const snapshot = currentSnapshot.value
    if (!snapshot || !snapshot.released || snapshot.invalidated) return null
    const task: ExportTask = {
      id: `EXP-${Date.now().toString().slice(-6)}`,
      name: '印刷交付包 · PDF/X-4',
      progress: 0,
      status: '排队中',
      updatedAt: '刚刚',
      resumable: true,
      snapshotId: snapshot.id,
      snapshotRevision: snapshot.revision,
      shards: buildShards(),
      blocked: false,
      blockedReason: null,
    }
    tasks.value.unshift(task)
    return task
  }

  /**
   * 恢复导出：按任务绑定的原快照还原，只补未完成分片。
   * 重复恢复不会新增任务，也不会混入新版本内容；放行失效时直接停下。
   */
  function resumeTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task || !task.resumable || task.status === '已完成') return
    if (task.blocked) return
    const snapshot = snapshotById(task.snapshotId)
    if (snapshot && (snapshot.invalidated || !snapshot.released)) {
      task.blocked = true
      task.blockedReason = snapshot.invalidationReason ?? '快照放行已失效，等待重新确认'
      task.status = '已中断'
      return
    }
    const nextShard = task.shards.find((shard) => !shard.done)
    if (!nextShard) {
      task.status = '已完成'
      task.progress = 100
      return
    }
    nextShard.done = true
    const doneCount = task.shards.filter((shard) => shard.done).length
    task.progress = Math.round((doneCount / task.shards.length) * 100)
    task.status = doneCount === task.shards.length ? '已完成' : '生成中'
    task.updatedAt = '刚刚'
  }

  return {
    pages, positions, proofs, tasks, snapshots, currentSnapshotId,
    side, zoom, revision, locked, selectedPosition, selectedProof,
    validations, currentSnapshot, releaseState, blockedTasks,
    updatePosition, addPosition, updateProof, createProof,
    lockBaseline, unlock, createExportTask, resumeTask, snapshotById,
  }
})
