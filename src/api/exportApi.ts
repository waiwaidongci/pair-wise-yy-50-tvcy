import axios, { type AxiosAdapter } from 'axios'
import type { ExportTask } from '../stores/imposition'
import { useImpositionStore } from '../stores/imposition'

/**
 * 模拟后端 REST。任务数据以 Pinia store 为唯一数据源，
 * 恢复时按任务绑定的只读快照还原、只补未完成分片，
 * 重复恢复不新增任务、不混入新版本内容。
 */
const adapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 160))
  const store = useImpositionStore()
  if (config.url === '/api/print/export-tasks' && config.method === 'get') {
    return { data: JSON.parse(JSON.stringify(store.tasks)), status: 200, statusText: 'OK', headers: {}, config }
  }
  if (config.url?.match(/^\/api\/print\/export-tasks\/[^/]+\/resume$/) && config.method === 'post') {
    const id = config.url.split('/').at(-2) ?? ''
    store.resumeTask(id)
    const task = store.tasks.find((item) => item.id === id) ?? null
    return { data: task ? JSON.parse(JSON.stringify(task)) : null, status: task ? 200 : 404, statusText: task ? 'OK' : 'Not Found', headers: {}, config }
  }
  return { data: null, status: 404, statusText: 'Not Found', headers: {}, config }
}

const client = axios.create({ adapter })

export const exportApi = {
  list: () => client.get<ExportTask[]>('/api/print/export-tasks'),
  resume: (id: string) => client.post<ExportTask>(`/api/print/export-tasks/${id}/resume`),
}
