<script setup lang="ts">
import { ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useImpositionStore } from '../stores/imposition'
import { exportApi } from '../api/exportApi'

const store = useImpositionStore()
const queryClient = useQueryClient()
const { data: tasks, isPending } = useQuery({
  queryKey: ['export-tasks'],
  queryFn: async () => (await exportApi.list()).data,
  initialData: store.tasks,
})
const resumeMutation = useMutation({
  mutationFn: async (id: string) => (await exportApi.resume(id)).data,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }),
})
const createHint = ref('')

function statusSeverity(status?: string) {
  return status === '已完成' ? 'success' : status === '已中断' ? 'danger' : status === '生成中' ? 'warn' : 'info'
}

function createTask() {
  const task = store.createExportTask()
  if (!task) {
    createHint.value = store.releaseState === '已失效'
      ? '当前快照放行已失效，请在打样审批中重新放行后再新建交付包。'
      : '当前拼版快照尚未放行，请先锁定并通过打样审批后再新建交付包。'
    return
  }
  createHint.value = ''
  queryClient.invalidateQueries({ queryKey: ['export-tasks'] })
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">EXPORT JOBS / 导出任务</p><h1>交付包与断点恢复</h1><p class="muted">每个交付包绑定一份只读版本快照，恢复时按原快照只补未完成分片，不混入新版本内容。</p></div>
      <Button label="新建印刷交付包" icon="pi pi-plus" @click="createTask" />
    </div>

    <Message v-if="createHint" severity="warn" :closable="false" class="mb-3">{{ createHint }}</Message>

    <div class="export-grid">
      <section class="panel">
        <div class="panel-head"><h3>导出队列</h3><span class="muted">Axios 模拟 REST · 按原快照恢复</span></div>
        <div v-if="isPending" class="loading">正在加载导出任务…</div>
        <div v-else class="task-list">
          <article v-for="task in (tasks ?? store.tasks)" :key="task.id">
            <div class="task-head">
              <div>
                <strong>{{ task.name }}</strong>
                <small>{{ task.id }} · {{ task.updatedAt }}</small>
              </div>
              <Tag :value="task.status" :severity="statusSeverity(task.status)" />
            </div>

            <div class="task-snapshot">
              <Tag v-if="task.snapshotRevision" :value="`绑定快照 ${task.snapshotRevision}`" severity="info" />
              <Tag v-else value="未绑定快照（历史任务）" severity="secondary" />
              <span v-if="task.blocked" class="blocked-note"><i class="pi pi-lock" />等待重新确认放行</span>
            </div>

            <ProgressBar :value="task.progress" :showValue="false" :style="{ height: '8px' }" />

            <ul class="shard-list">
              <li v-for="shard in task.shards" :key="shard.id" :class="{ done: shard.done }">
                <i :class="shard.done ? 'pi pi-check-circle' : 'pi pi-circle'" />
                <span>{{ shard.label }}</span>
              </li>
            </ul>

            <Message v-if="task.blocked" severity="danger" :closable="false" class="blocked-msg">
              放行已失效：{{ task.blockedReason }}。导出已停下，重新放行后可继续补全分片。
            </Message>

            <div class="task-foot">
              <span>{{ task.progress }}% · {{ task.shards.filter((s) => s.done).length }}/{{ task.shards.length }} 分片 · {{ task.progress === 100 ? '文件哈希已校验' : '仅补未完成分片' }}</span>
              <Button
                v-if="task.blocked"
                label="等待重新确认"
                icon="pi pi-lock"
                size="small"
                severity="danger"
                outlined
                disabled
              />
              <Button
                v-else-if="task.resumable && task.status !== '已完成'"
                label="恢复任务"
                icon="pi pi-play"
                size="small"
                :loading="resumeMutation.isPending.value"
                @click="resumeMutation.mutate(task.id)"
              />
              <Button v-else-if="task.status !== '已完成'" label="重新生成" icon="pi pi-refresh" size="small" outlined />
              <Button v-else label="打开结果" icon="pi pi-external-link" size="small" text />
            </div>
          </article>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>交付包内容</h3><Tag :value="store.currentSnapshot?.revision ?? '未锁定'" /></div>
          <div class="package-list">
            <div><i class="pi pi-file-pdf" /><span>拼版 PDF/X-4</span><strong>按绑定快照生成</strong></div>
            <div><i class="pi pi-check-circle" /><span>预检报告 JSON</span><strong>{{ store.currentSnapshot?.validations.length ?? store.validations.length }} 项（快照定格）</strong></div>
            <div><i class="pi pi-check-circle" /><span>色彩控制条报告</span><strong>已包含</strong></div>
            <div><i class="pi pi-check-circle" /><span>打样审批记录</span><strong>{{ store.proofs.length }} 轮</strong></div>
            <div><i class="pi pi-check-circle" /><span>纸张与折手规格</span><strong>已包含</strong></div>
          </div>
        </section>
        <section class="panel recovery">
          <div class="panel-head"><h3>恢复说明</h3></div>
          <p>每个交付包在创建时绑定一份只读版本快照（页面、版位、预检结果已定格）。恢复时只补未完成分片，不读取当前活件；若快照放行已失效，导出停下等待重新确认，重复恢复不会新增任务。</p>
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
.task-head { margin-bottom: 8px; }
.task-head strong, .task-head small { display: block; }
.task-head small { margin-top: 4px; color: #7c898f; font-size: 10px; }
.task-snapshot { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.blocked-note { display: inline-flex; align-items: center; gap: 4px; color: #b84e35; font-size: 11px; font-weight: 700; }
.shard-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; margin: 10px 0 0; padding: 0; list-style: none; }
.shard-list li { display: flex; align-items: center; gap: 6px; color: #8a969a; font-size: 11px; }
.shard-list li i { color: #c3ccd0; font-size: 12px; }
.shard-list li.done { color: #397d64; }
.shard-list li.done i { color: #397d64; }
.blocked-msg { margin: 10px 0 0; }
.task-foot { margin-top: 9px; }
.task-foot span { color: #68777e; font-size: 10px; }
aside { display: grid; gap: 14px; }
.package-list { padding: 8px 16px 16px; }
.package-list div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #edf1f1; font-size: 11px; }
.package-list i { color: #397d64; }
.package-list strong { color: #536b72; font-size: 10px; }
.recovery p { padding: 0 16px; color: #67767d; font-size: 11px; line-height: 1.6; }
.recovery :deep(.p-button) { width: calc(100% - 32px); margin: 0 16px 16px; }
@media (max-width: 1000px) { .export-grid { grid-template-columns: 1fr; } }
</style>
