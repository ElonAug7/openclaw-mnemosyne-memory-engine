/**
 * crosslang.js — Cross-Language Alignment (v4.5-Pro Phase 5)
 *
 * Bilingual entity mapping for automatic query expansion.
 * Zero deps — pure dictionary-based.
 *
 * Exports: expandCrossLang(), getOutputConstraint(), isEquivalent()
 */

const ENTITY_MAP = {
  // Tech
  'memory engine': '记忆引擎',
  'search': '搜索',
  'scoring': '评分',
  'embedding': '嵌入',
  'vector': '向量',
  'tokenizer': '分词器',
  'keywords': '关键词',
  // Places  
  'shenzhen': '深圳',
  'beijing': '北京',
  'shanghai': '上海',
  'wuhan': '武汉',
  'hangzhou': '杭州',
  'guangzhou': '广州',
  'china': '中国',
  // Companies
  'tencent': '腾讯',
  'bytedance': '字节跳动',
  'alibaba': '阿里巴巴',
  'google': '谷歌',
  'microsoft': '微软',
  'openai': 'OpenAI',
  // Concepts
  'university': '大学',
  'hospital': '医院',
  'office': '办公室',
  'hotel': '酒店',
  'restaurant': '餐厅',
  'apartment': '公寓',
  'team': '团队',
  'project': '项目',
  'feature': '功能',
  'bug': '缺陷',
  'deploy': '部署',
  'install': '安装',
  'config': '配置',
  'backup': '备份',
  'benchmark': '基准测试',
  'pipeline': '管线',
  'latency': '延迟',
  'throughput': '吞吐',
};

// Build reverse map
const REVERSE_MAP = {};
for (const [en, cn] of Object.entries(ENTITY_MAP)) {
  REVERSE_MAP[cn] = en;
}

function expandCrossLang(query) {
  const terms = [];
  const lower = query.toLowerCase();
  
  // English → Chinese
  for (const [en, cn] of Object.entries(ENTITY_MAP)) {
    if (lower.includes(en) && !lower.includes(cn)) {
      terms.push(cn);
    }
  }
  
  // Chinese → English
  for (const [cn, en] of Object.entries(REVERSE_MAP)) {
    if (query.includes(cn) && !lower.includes(en)) {
      terms.push(en);
    }
  }
  
  if (!terms.length) return [query];
  
  return [query, query + ' OR ' + [...new Set(terms)].join(' OR ')];
}

function getOutputConstraint(query) {
  const hasCJK = /[\u4e00-\u9fff]/.test(query);
  const hasLatin = /[a-zA-Z]{3,}/.test(query);
  
  if (hasCJK && !hasLatin) return 'Answer in Chinese only.';
  if (!hasCJK && hasLatin) return 'Answer in English only. Do not mix Chinese characters.';
  return null; // Mixed or ambiguous
}

function isEquivalent(a, b) {
  const norm = s => (s || '').toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, '');
  const na = norm(a);
  const nb = norm(b);
  
  if (na === nb) return true;
  
  // Check entity map equivalence
  for (const [en, cn] of Object.entries(ENTITY_MAP)) {
    if ((na.includes(en) && nb.includes(cn)) || (na.includes(cn) && nb.includes(en))) {
      const rest_a = na.replace(en, '').replace(cn, '');
      const rest_b = nb.replace(en, '').replace(cn, '');
      if (rest_a === rest_b) return true;
    }
  }
  
  return false;
}

module.exports = { ENTITY_MAP, expandCrossLang, getOutputConstraint, isEquivalent };
