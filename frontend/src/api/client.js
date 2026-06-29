import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.message)
    return Promise.reject(error)
  }
)

export const syncData = (fy) => api.post('/sync', { fy })

export const getTransactions = ({ fy, asset, type, source, page = 1, limit = 50 }) => {
  const params = new URLSearchParams()
  if (fy) params.append('fy', fy)
  if (asset) params.append('asset', asset)
  if (type) params.append('type', type)
  if (source) params.append('source', source)
  params.append('page', page)
  params.append('limit', limit)
  return api.get(`/transactions?${params.toString()}`)
}

export const getHoldings = () => api.get('/holdings')

export const getGraphOverview = (fy) => {
  const params = new URLSearchParams()
  if (fy) params.append('fy', fy)
  const query = params.toString()
  return api.get(`/graph/overview${query ? '?' + query : ''}`)
}

export const getAssetGraph = (asset, fy) => {
  const params = new URLSearchParams()
  if (fy) params.append('fy', fy)
  const query = params.toString()
  return api.get(`/graph/asset/${asset}${query ? '?' + query : ''}`)
}

export const getFinancialYears = () => api.get('/financial-years')

export const getSyncStatus = (fy) => {
  const params = fy ? `?fy=${fy}` : ''
  return api.get(`/sync/status${params}`)
}

export const getTally = ({ fy, asset } = {}) => {
  const params = new URLSearchParams()
  if (fy) params.append('fy', fy)
  if (asset) params.append('asset', asset)
  const query = params.toString()
  return api.get(`/import/tally${query ? '?' + query : ''}`)
}

export const importExcel = (files) => {
  const formData = new FormData()
  const fileList = Array.isArray(files) ? files : [files]
  fileList.forEach((f) => formData.append('files', f))
  return api.post('/import/excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

export default api
