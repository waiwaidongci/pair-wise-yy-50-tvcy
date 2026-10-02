<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const accepted = ref(['CH-02', 'CH-03'])
const changes = [
  { id: 'CH-01', title: 'P7 右移 18mm 并增加 2mm 出血', before: 'x 34 / bleed 1mm', after: 'x 52 / bleed 3mm', risk: '低' },
  { id: 'CH-02', title: 'P1 封面旋转 180° 以匹配骑马订折手', before: 'rotation 0°', after: 'rotation 180°', risk: '中' },
  { id: 'CH-03', title: 'P4 与 P5 跨页间距缩短 4mm', before: 'gutter 10mm', after: 'gutter 6mm', risk: '中' },
  { id: 'CH-04', title: 'P2 版权页采用低出血文件', before: 'bleed 2mm', after: 'bleed 1mm', risk: '高' },
]

/** 基线/候选均取自定格快照；快照不足时回退到当前活件 */
const baselineSnapshot = computed(() => store.snapshots[store.snapshots.length - 2] ?? null)
const candidateSnapshot = computed(() => store.snapshots[store.snapshots.length - 1] ?? null)
const baselinePositions = computed(() => baselineSnapshot.value?.positions ?? store.positions)
const candidatePositions = computed(() => candidateSnapshot.value?.positions ?? store.positions)
const baselineValidations = computed(() => baselineSnapshot.value?.validations ?? store.validations)
const candidateValidations = computed(() => candidateSnapshot.value?.validations ?? store.validations)

function releaseSeverity(snapshot: { released: boolean; invalidated: boolean } | null) {
  if (!snapshot) return 'secondary'
  if (snapshot.invalidated) return 'danger'
  if (snapshot.released) return 'success'
  return 'warn'
}
function releaseLabel(snapshot: { released: boolean; invalidated: boolean } | null) {
  if (!snapshot) return '无快照'
  if (snapshot.invalidated) return '已失效'
  if (snapshot.released) return '已放行'
  return '待放行'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比</p><h1>拼版版本并排审阅</h1><p class="muted">基线与候选均使用锁定时定格的只读快照（页面、版位、预检结果），放行与导出都对版同一份快照。</p></div>
      <div class="actions"><Button label="导出对比报告" icon="pi pi-file-export" outlined /><Button :label="store.locked ? '已锁定' : '接受变更并锁定'" icon="pi pi-lock" :disabled="store.locked || accepted.length === 0" @click="store.lockBaseline" /></div>
    </div>

    <div class="compare-grid">
      <section class="panel">
        <div class="panel-head"><h3>基线 {{ baselineSnapshot?.revision ?? '无' }}</h3><Tag :value="releaseLabel(baselineSnapshot)" :severity="releaseSeverity(baselineSnapshot)" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="baselinePositions" side="front" :zoom="38" :selected="null" :validations="baselineValidations" @update="() => {}" @select="() => {}" /></div>
      </section>
      <section class="panel candidate">
        <div class="panel-head"><h3>候选 {{ candidateSnapshot?.revision ?? store.revision }}</h3><Tag :value="releaseLabel(candidateSnapshot)" :severity="releaseSeverity(candidateSnapshot)" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="candidatePositions" side="front" :zoom="38" :selected="null" :validations="candidateValidations" @update="() => {}" @select="() => {}" /></div>
      </section>
    </div>

    <section v-if="store.snapshots.length" class="panel snapshot-panel">
      <div class="panel-head"><h3>快照历史</h3><span class="muted">锁定即定格，放行/导出均对版同一份</span></div>
      <div class="snapshot-list">
        <article v-for="snapshot in store.snapshots.slice().reverse()" :key="snapshot.id">
          <div>
            <strong>{{ snapshot.revision }} · {{ snapshot.id }}</strong>
            <small>定格于 {{ new Date(snapshot.lockedAt).toLocaleString('zh-CN') }} · {{ snapshot.pages.length }} 页 / {{ snapshot.positions.length }} 版位 / {{ snapshot.validations.length }} 项预检</small>
          </div>
          <Tag :value="releaseLabel(snapshot)" :severity="releaseSeverity(snapshot)" />
        </article>
      </div>
    </section>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式变更差异</h3><span class="muted">接受 {{ accepted.length }}/{{ changes.length }} 项</span></div>
      <div class="change-list">
        <article v-for="change in changes" :key="change.id">
          <Checkbox v-model="accepted" :inputId="change.id" :value="change.id" />
          <div><strong>{{ change.id }} · {{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
          <Tag :value="`${change.risk}风险`" :severity="change.risk === '高' ? 'danger' : change.risk === '中' ? 'warn' : 'success'" />
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.candidate { border-color: #5d9693; }
.canvas-box { height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.snapshot-panel { margin-bottom: 14px; overflow: hidden; }
.snapshot-list article { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #edf1f1; }
.snapshot-list strong, .snapshot-list small { display: block; }
.snapshot-list strong { font-size: 12px; }
.snapshot-list small { margin-top: 4px; color: #7a878e; font-size: 10px; }
.change-panel { overflow: hidden; }
.change-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list strong { font-size: 12px; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>
