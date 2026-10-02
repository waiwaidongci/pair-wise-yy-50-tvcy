<script setup lang="ts">
import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useImpositionStore } from '../stores/imposition'
import { exportApi } from '../api/exportApi'

const store = useImpositionStore()
const queryClient = useQueryClient()
const { data: tasks, isPending } = useQuery({
  queryKey: ['export-tasks'],
  queryFn: async () => (await exportApi.list()).data,
  initialData: store.tasks,
  refetchInterval: 500,
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] })
const createMutation = useMutation({ mutationFn: async () => (await exportApi.create()).data, onSuccess: invalidate })
const resumeMutation = useMutation({ mutationFn: async (id: string) => (await exportApi.resume(id)).data, onSuccess: invalidate })
const confirmMutation = useMutation({ mutationFn: async (id: string) => (await exportApi.confirm(id)).data, onSuccess: invalidate })

const pausedCount = computed(() => store.tasks.filter((task) => task.status === '待确认').length)
const blockers = computed(() => {
  const reasons: string[] = []
  if (!store.locked || !store.lockedSnapshot) reasons.push('基线未锁定')
  else {
    if (!store.contentIntact) reasons.push('锁定后页面或版位已改动')
    if (!store.release) reasons.push('打样未通过，或打样记录在放行后被补录/修改')
  }
  return reasons
})

function statusSeverity(status?: string) {
  return status === '已完成' ? 'success' : status === '已中断' ? 'danger' : status === '待确认' ? 'warn' : 'info'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">EXPORT JOBS / 导出任务</p><h1>交付包与断点恢复</h1><p class="muted">每个导出任务绑定锁定时的只读快照（版本 + 指纹），恢复只补未完成分片，不混入新版本内容。</p></div>
      <Button label="新建印刷交付包" icon="pi pi-plus" :disabled="!store.releaseValid" :loading="createMutation.isPending.value" @click="createMutation.mutate()" />
    </div>

    <Message v-if="!store.releaseValid" severity="warn" :closable="false" class="mb-3">
      放行未生效：{{ blockers.join('；') }}。<template v-if="pausedCount">已暂停 {{ pausedCount }} 个导出任务，等待重新确认。</template><template v-else>确认放行前无法新建或恢复导出。</template>
    </Message>
    <Message v-else severity="success" :closable="false" class="mb-3">
      放行有效：快照 {{ store.lockedSnapshot?.revision }} · 指纹 {{ store.lockedSnapshot?.fingerprint }} · {{ store.release?.proofId }} 打样通过。
    </Message>

    <div class="export-grid">
      <section class="panel">
        <div class="panel-head"><h3>导出队列</h3><span class="muted">Axios 模拟 REST</span></div>
        <div v-if="isPending" class="loading">正在加载导出任务…</div>
        <div v-else class="task-list">
          <article v-for="task in (tasks ?? [])" :key="task.id">
            <div class="task-head">
              <div><strong>{{ task.name }}</strong><small>{{ task.id }} · {{ task.updatedAt }}</small></div>
              <Tag :value="task.status" :severity="statusSeverity(task.status)" />
            </div>
            <div class="snapshot-line">
              <Tag :value="`快照 ${task.revision}`" severity="info" />
              <span>指纹 {{ task.fingerprint }}</span>
              <span>分片 {{ task.shardsDone }}/{{ task.shardsTotal }}</span>
            </div>
            <ProgressBar :value="task.progress" :showValue="false" :style="{ height: '8px' }" />
            <div class="task-foot">
              <span>{{ task.progress }}% · {{ task.status === '已完成' ? '文件哈希已校验' : task.status === '待确认' ? '放行失效，等待重新确认' : '只补未完成分片' }}</span>
              <Button v-if="task.status === '待确认'" label="重新确认" icon="pi pi-check" size="small" severity="warn" :disabled="!store.releaseValid" :loading="confirmMutation.isPending.value" @click="confirmMutation.mutate(task.id)" />
              <Button v-else-if="task.status === '已中断' || task.status === '排队中'" label="恢复任务" icon="pi pi-play" size="small" :disabled="!store.releaseValid" :loading="resumeMutation.isPending.value" @click="resumeMutation.mutate(task.id)" />
              <Button v-else-if="task.status === '生成中'" label="生成中…" icon="pi pi-spin pi-spinner" size="small" disabled />
              <Button v-else label="打开结果" icon="pi pi-external-link" size="small" text />
            </div>
          </article>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>交付包内容</h3><Tag :value="store.lockedSnapshot ? `${store.lockedSnapshot.revision} 快照` : '未锁定'" :severity="store.releaseValid ? 'success' : 'warn'" /></div>
          <div v-if="store.lockedSnapshot" class="package-list">
            <div><i class="pi pi-file-pdf" /><span>拼版 PDF/X-4（{{ store.lockedSnapshot.pages.length }}P）</span><strong>指纹 {{ store.lockedSnapshot.fingerprint }}</strong></div>
            <div><i class="pi pi-th-large" /><span>版位定格</span><strong>{{ store.lockedSnapshot.positions.length }} 个版位</strong></div>
            <div><i class="pi pi-check-circle" /><span>预检报告 JSON</span><strong>{{ store.lockedSnapshot.validations.length }} 项</strong></div>
            <div><i class="pi pi-verified" /><span>打样放行</span><strong>{{ store.release ? `${store.release.proofId} · ${store.release.revision}` : '未放行' }}</strong></div>
            <div><i class="pi pi-lock" /><span>锁定时间</span><strong>{{ store.lockedSnapshot.lockedAt }}</strong></div>
          </div>
          <p v-else class="empty-hint">尚未锁定基线，交付包没有可绑定的只读快照。</p>
        </section>
        <section class="panel recovery">
          <div class="panel-head"><h3>恢复说明</h3></div>
          <p>恢复严格基于任务绑定的只读快照（版本 + 指纹），只补未完成分片；重复恢复不会新建任务，也不会混入新版本内容。放行失效时任务自动暂停，需重新确认后再继续。</p>
          <Button label="清理已完成任务" severity="secondary" outlined fluid />
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.export-grid { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 14px; align-items: start; }
.mb-3 { margin-bottom: 12px; }
.loading { padding: 30px; color: #75838a; text-align: center; }
.task-list { padding: 8px 16px 16px; }
.task-list article { padding: 15px 0; border-bottom: 1px solid #e9eeee; }
.task-head, .task-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-head { margin-bottom: 9px; }
.task-head strong, .task-head small { display: block; }
.task-head small { margin-top: 4px; color: #7c898f; font-size: 10px; }
.snapshot-line { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; color: #68777e; font-size: 10px; font-family: monospace; }
.task-foot { margin-top: 9px; }
.task-foot span { color: #68777e; font-size: 10px; }
aside { display: grid; gap: 14px; }
.package-list { padding: 8px 16px 16px; }
.package-list div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #edf1f1; font-size: 11px; }
.package-list i { color: #397d64; }
.package-list strong { color: #536b72; font-size: 10px; }
.empty-hint { margin: 0; padding: 18px 16px; color: #7e8a8f; font-size: 11px; }
.recovery p { padding: 0 16px; color: #67767d; font-size: 11px; line-height: 1.6; }
.recovery :deep(.p-button) { width: calc(100% - 32px); margin: 0 16px 16px; }
@media (max-width: 1000px) { .export-grid { grid-template-columns: 1fr; } }
</style>
