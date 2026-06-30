import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.message)
    return Promise.reject(error)
  }
)

export const getTransactions = ({ fy, asset, type, page = 1, limit = 50 }) => {
  const params = new URLSearchParams()
  if (fy) params.append('fy', fy)
  if (asset) params.append('asset', asset)
  if (type) params.append('type', type)
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

export const getCoinList = () => api.get('/flow/coins')
export const getCoinFlow = (asset) => api.get(`/flow/coin/${asset}`)

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
