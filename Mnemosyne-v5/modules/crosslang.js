/**
 * crosslang.js — Cross-Language Alignment (v5)
 *
 * Bilingual entity mapping for automatic query expansion.
 * Zero deps — pure dictionary-based.
 * v5: crosslang-user.json user dictionary support.
 *
 * Exports: expandCrossLang(), getOutputConstraint(), isEquivalent()
 */

const path = require('path');
const fs = require('fs');

const ENTITY_MAP = {
  // Tech
  'memory engine': '记忆引擎',
  'search': '搜索',
  'scoring': '评分',
  'embedding': '嵌入',
  'vector': '向量',
  'tokenizer': '分词器',
  'keywords': '关键词',
  'kubernetes': 'K8s',
  'k8s': 'Kubernetes',
  'llm': '大语言模型',
  'large language model': '大语言模型',
  'rag': '检索增强生成',
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

// 加载用户自定义词典（内存缓存，启动时加载一次）
const USER_DICT_FILE = path.join(path.dirname(__dirname), '..', '..', 'memory', 'engine', 'crosslang-user.json');
let _userDict = null;

function loadUserDict() {
  if (_userDict) return _userDict;
  try {
    _userDict = JSON.parse(fs.readFileSync(USER_DICT_FILE, 'utf8'));
  } catch {
    _userDict = {};
    const template = { "_": "Add your custom mappings. Format: \"english\": \"中文\"", "K8s": "Kubernetes", "LLM": "大语言模型" };
    try { fs.writeFileSync(USER_DICT_FILE, JSON.stringify(template, null, 2)); } catch {}
  }
  return _userDict;
}

// 合并内置表 + 用户词典
function getFullEntityMap() {
  const user = loadUserDict();
  const merged = { ...ENTITY_MAP };
  for (const [k, v] of Object.entries(user)) {
    if (k !== '_') merged[k.toLowerCase()] = v;
  }
  return merged;
}

// Build reverse map (from merged entity map)
function getReverseMap() {
  const full = getFullEntityMap();
  const rev = {};
  for (const [en, cn] of Object.entries(full)) {
    rev[cn] = en;
  }
  return rev;
}

function expandCrossLang(query) {
  const full = getFullEntityMap();
  const reverse = getReverseMap();
  const terms = [];
  const lower = query.toLowerCase();
  
  // English → Chinese
  for (const [en, cn] of Object.entries(full)) {
    if (lower.includes(en) && !lower.includes(cn)) {
      terms.push(cn);
    }
  }
  
  // Chinese → English
  for (const [cn, en] of Object.entries(reverse)) {
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
