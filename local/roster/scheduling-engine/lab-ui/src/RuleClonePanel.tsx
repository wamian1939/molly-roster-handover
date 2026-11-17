import React, {useState} from 'react'

type Store = {id: string; name: string}

type Props = {
  currentStore: string
  stores: Store[]
  busy: boolean
  onCopy: (sourceStore: string) => Promise<void>
}

export function RuleClonePanel({currentStore, stores, busy, onCopy}: Props) {
  const sources = [{id: 'mock-hurstville', name: 'Mock Hurstville'}, ...stores]
    .filter(store => store.id !== currentStore)
  const [sourceStore, setSourceStore] = useState('')
  const chosen = sources.some(store => store.id === sourceStore) ? sourceStore : ''
  return <section className="panel ruleClonePanel">
    <div className="panelTitle"><h2>从其他门店复制规则</h2><span>载入当前门店草稿</span></div>
    <p className="help">复制班型定义、每周七天的班型人数和优化参数。请核对目标门店的岗位、时间与人数后再保存。</p>
    <div className="ruleCloneControls"><label>来源门店<select value={chosen} onChange={event => setSourceStore(event.target.value)}>
      <option value="">选择已保存规则的门店</option>
      {sources.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
    </select></label><button className="secondary" type="button" disabled={!chosen || busy} onClick={() => onCopy(chosen)}>载入规则草稿</button></div>
  </section>
}
