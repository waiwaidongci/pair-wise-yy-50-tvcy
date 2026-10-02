import axios, { type AxiosAdapter, type AxiosResponse } from 'axios'
import { useImpositionStore, type ExportTask } from '../stores/imposition'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 模拟 REST 层不持有自己的任务状态，全部读写 Pinia 中的同一份数据，
// 避免队列里的导出与锁定/打样各记各的、恢复时拿到错内容。
const adapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 160))
  const store = useImpositionStore()
  const respond = (data: unknown, status = 200): AxiosResponse => ({ data, status, statusText: status === 200 ? 'OK' : status === 409 ? 'Conflict' : 'Not Found', headers: {}, config })

  if (config.url === '/api/print/export-tasks' && config.method === 'get') {
    return respond(clone(store.tasks))
  }
  if (config.url === '/api/print/export-tasks' && config.method === 'post') {
    const task = store.createTask()
    return task ? respond(clone(task)) : respond(null, 409)
  }
  const action = config.url?.match(/^\/api\/print\/export-tasks\/([^/]+)\/(resume|confirm)$/)
  if (action && config.method === 'post') {
    const [, id, verb] = action
    if (verb === 'resume') store.resumeTask(id)
    else store.confirmTask(id)
    const task = store.tasks.find((item) => item.id === id)
    return task ? respond(clone(task)) : respond(null, 404)
  }
  return respond(null, 404)
}

const client = axios.create({ adapter })

export const exportApi = {
  list: () => client.get<ExportTask[]>('/api/print/export-tasks'),
  create: () => client.post<ExportTask>('/api/print/export-tasks'),
  resume: (id: string) => client.post<ExportTask>(`/api/print/export-tasks/${id}/resume`),
  confirm: (id: string) => client.post<ExportTask>(`/api/print/export-tasks/${id}/confirm`),
}
