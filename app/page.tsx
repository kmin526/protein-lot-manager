"use client";

import React, { useState, useEffect } from 'react';

import { supabase } from '@/lib/supabase';

import {
  FlaskConical, Plus, Search, Download, Upload, Trash2, Edit3, Save, X,
  CheckCircle2, AlertCircle, Clock, Beaker, Microscope, FileText,
  Image as ImageIcon, BarChart3, Calendar, Hash, Layers, ChevronRight,
  ChevronLeft, Eye, FileDown, Activity, TrendingUp, Droplet
} from 'lucide-react';

// ============== Helpers ==============
const todayISO = () => new Date().toISOString().slice(0, 10);

// Generate a temporary ID like "TEMP-2026-0513-A" using date + sequential letter
const generateTempId = (existingLots = []) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const datePrefix = `TEMP-${y}-${m}${d}`;
  const sameDay = existingLots.filter(l => l.tempId?.startsWith(datePrefix));
  const letter = String.fromCharCode(65 + sameDay.length); // A, B, C...
  return `${datePrefix}-${letter}`;
};

const newLotTemplate = (tempId = '') => ({
  tempId,                          // 임시 식별자 (생성 시 자동 부여)

  // 중간체: His-TEV FAM19A5 (Ni-NTA 정제 + 농축 후)
  intermediateLotNumber: '',
  intermediateLotAssignedAt: '',
  intermediateLotAssignedBy: '',

  // 최종 산물: rcFAM19A5 (TEV cleavage + His tag 제거 후)
  lotNumber: '',                   // 정식 LOT 번호 (최종 rcFAM19A5)
  lotNumberAssignedAt: '',
  lotNumberAssignedBy: '',

  intermediateName: 'His-TEV FAM19A5',
  proteinName: 'rcFAM19A5',
  expressionSystem: 'Expi293F',
  status: 'In Progress', // 'In Progress' | 'QC Passed' | 'QC Failed' | 'Released'
  createdAt: todayISO(),
  updatedAt: todayISO(),
  operator: '',
  reviewer: '',

  // 1) Production
  production: {
    cellSeedingDate: '',
    seedingFlaskCount: 4,
    transfectionDate: '',
    transfectionFlaskCount: 4,
    plasmidAmount_ug: 200,
    enhancerDate: '',
    harvestDate: '',
    harvestVolume_mL: '',
    notes: ''
  },

  // 2) Purification (Ni-NTA / IMAC)
  purification: {
    purificationDate: '',
    resin: 'Ni Sepharose High Performance',
    imidazoleGradient: '0/5/10/15/20/25/30/40/50/100/300/500 mM',
    pooledFractions: '', // e.g. "100, 300, 500 mM"
    notes: ''
  },

  // 3) Concentration & Buffer Exchange
  concentration: {
    // 1차 농축 — Ni-NTA 정제 후 → His-TEV FAM19A5
    first: {
      startDate: '',
      endDate: '',
      filterDevice: 'Amicon Ultra-15 (10K)',
      bufferExchangeCycles: 8,
      finalBuffer: '1x DPBS',
      finalVolume_mL: '',
      nanodropConc_mg_mL: '',
      e1pct: 11.32, // His-TEV FAM19A5
      totalYield_mg: '',
      notes: ''
    },
    // 2차 농축 — TEV cleavage 후 → rcFAM19A5
    second: {
      startDate: '',
      endDate: '',
      filterDevice: 'Amicon Ultra-15 (3K)',
      bufferExchangeCycles: 8,
      finalBuffer: '1x DPBS',
      finalVolume_mL: '',
      nanodropConc_mg_mL: '',
      e1pct: 11.67, // rcFAM19A5
      totalYield_mg: '',
      notes: ''
    }
  },

  // 4) TEV Cleavage & His-tag elimination
  tevCleavage: {
    date: '',
    inputProtein_mg: '',
    tevProtease_uL: '',
    incubationCondition: '4℃ overnight',
    notes: ''
  },

  // 5) QC tests — 각 항목마다 중간체(His-TEV FAM19A5)와 최종(rcFAM19A5) 이미지 각각 업로드
  qc: {
    coomassie: {
      date: '',
      notes: '',
      intermediate: { imageDataUrl: '' },
      final:        { imageDataUrl: '' }
    },
    westernBlot: {
      date: '',
      notes: '',
      intermediate: { imageDataUrl: '' },
      final:        { imageDataUrl: '' }
    },
    concentrationQC: {
      date: '',
      notes: '',
      intermediate: { imageDataUrl: '' },
      final:        { imageDataUrl: '' }
    },
    elisa: {
      date: '',
      notes: '',
      intermediate: { imageDataUrl: '' },
      final:        { imageDataUrl: '' }
    }
  },

  // 6) Storage
  storage: {
    aliquotVolume_uL: '',
    aliquotCount: '',
    storageTemp: '-80℃',
    storageLocation: '',
    notes: ''
  }
});

const STATUS_STYLES = {
  'In Progress': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', icon: Clock },
  'QC Passed':   { bg: '#dcfce7', text: '#166534', dot: '#22c55e', icon: CheckCircle2 },
  'QC Failed':   { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', icon: AlertCircle },
  'Released':    { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6', icon: CheckCircle2 }
};

// Migrate legacy LOT data (flat concentration + tevCleavage with yield fields) → new structure
function migrateLot(lot) {
  if (!lot) return lot;
  const migrated = { ...lot };

  // concentration: flat → { first, second }
  if (migrated.concentration && !migrated.concentration.first && !migrated.concentration.second) {
    const old = migrated.concentration;
    migrated.concentration = {
      first: {
        startDate: '',
        endDate: old.date || '',
        filterDevice: old.filterDevice || 'Amicon Ultra-15 (10K)',
        bufferExchangeCycles: old.bufferExchangeCycles ?? 8,
        finalBuffer: old.finalBuffer || '1x DPBS',
        finalVolume_mL: old.finalVolume_mL || '',
        nanodropConc_mg_mL: old.nanodropConc_mg_mL || '',
        e1pct: 11.32,
        totalYield_mg: old.totalYield_mg || '',
        notes: old.notes || ''
      },
      second: {
        startDate: '',
        endDate: '',
        filterDevice: 'Amicon Ultra-15 (3K)',
        bufferExchangeCycles: 8,
        finalBuffer: '1x DPBS',
        finalVolume_mL: '',
        nanodropConc_mg_mL: '',
        e1pct: 11.67,
        totalYield_mg: '',
        notes: ''
      }
    };

    // tevCleavage had final concentration fields — move into 2nd concentration
    if (migrated.tevCleavage) {
      const t = migrated.tevCleavage;
      if (t.finalNanodropConc_mg_mL || t.finalVolume_mL || t.finalYield_mg) {
        migrated.concentration.second.endDate = t.date || '';
        migrated.concentration.second.nanodropConc_mg_mL = t.finalNanodropConc_mg_mL || '';
        migrated.concentration.second.finalVolume_mL = t.finalVolume_mL || '';
        migrated.concentration.second.totalYield_mg = t.finalYield_mg || '';
      }
      // clean up old tev fields
      migrated.tevCleavage = {
        date: t.date || '',
        inputProtein_mg: t.inputProtein_mg || '',
        tevProtease_uL: t.tevProtease_uL || '',
        incubationCondition: t.incubationCondition || '4℃ overnight',
        notes: t.notes || ''
      };
    }
  }

  // QC migration: 옛 구조(여러 필드) → 새 구조(날짜+노트+이미지만)
  if (migrated.qc) {
    // coomassie
    const c = migrated.qc.coomassie;
    if (c && (!c.intermediate || c.intermediate.loadingAmounts_ug !== undefined)) {
      migrated.qc.coomassie = {
        date: c.date || '',
        notes: c.notes || '',
        intermediate: { imageDataUrl: c.intermediate?.imageDataUrl || '' },
        final: { imageDataUrl: c.final?.imageDataUrl || c.imageDataUrl || '' }
      };
    }
    // westernBlot
    const w = migrated.qc.westernBlot;
    if (w && (!w.intermediate || w.intermediate.loadingAmounts_ug !== undefined)) {
      migrated.qc.westernBlot = {
        date: w.date || '',
        notes: w.notes || '',
        intermediate: { imageDataUrl: w.intermediate?.imageDataUrl || '' },
        final: { imageDataUrl: w.final?.imageDataUrl || w.imageDataUrl || '' }
      };
    }
    // concentrationQC
    const cq = migrated.qc.concentrationQC;
    if (cq && (!cq.intermediate || cq.intermediate.a280 !== undefined)) {
      migrated.qc.concentrationQC = {
        date: cq.measuredDate || cq.date || '',
        notes: cq.notes || '',
        intermediate: { imageDataUrl: cq.intermediate?.imageDataUrl || '' },
        final: { imageDataUrl: cq.final?.imageDataUrl || '' }
      };
    }
    // elisa
    const e = migrated.qc.elisa;
    if (e && (!e.intermediate || e.intermediate.ec50_pg_mL !== undefined)) {
      migrated.qc.elisa = {
        date: e.date || '',
        notes: e.notes || '',
        intermediate: { imageDataUrl: e.intermediate?.imageDataUrl || '' },
        final: { imageDataUrl: e.final?.imageDataUrl || e.standardCurveImageDataUrl || '' }
      };
    }
  }

  return migrated;
}

// ============== Main App ==============
export default function ProteinLotManager() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'new'
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [toast, setToast] = useState(null);

 // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('protein_lots')
          .select('*');
        
        if (error) throw error;
        
        const loaded = (data || []).map(row => ({
          id: row.lot_id,
          ...migrateLot(row.data)
        }));
        loaded.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        setLots(loaded);
      } catch (e) {
        console.error('Load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  

  const saveLot = async (lot) => {
    const id = lot.id || `lot_${Date.now()}`;
    const toSave = { ...lot, updatedAt: todayISO() };
    delete toSave.id;
    
    const { error } = await supabase
      .from('protein_lots')
      .upsert({ lot_id: id, data: toSave }, { onConflict: 'lot_id' });
    
    if (error) {
      console.error('Save error', error);
      showToast('저장 실패: ' + error.message, 'error');
      return id;
    }
    
    const exists = lots.find(l => l.id === id);
    let updated;
    if (exists) {
      updated = lots.map(l => l.id === id ? { id, ...toSave } : l);
    } else {
      updated = [{ id, ...toSave }, ...lots];
    }
    updated.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    setLots(updated);
    showToast(exists ? 'LOT 정보가 저장되었습니다' : '새 LOT이 생성되었습니다');
    return id;
  };

  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, onConfirm, danger }

  const deleteLot = (id) => {
    const target = lots.find(l => l.id === id);
    const label = target?.lotNumber || target?.intermediateLotNumber || target?.tempId || id;
    setConfirmDialog({
      title: 'LOT 삭제',
      message: `"${label}"을(를) 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      danger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('protein_lots')
            .delete()
            .eq('lot_id', id);
          
          if (error) {
            console.error('Delete error', error);
            showToast('삭제 실패: ' + error.message, 'error');
            return;
          }
          
          const updated = lots.filter(l => l.id !== id);
          setLots(updated);
          setView('list');
          setSelectedLotId(null);
          showToast('LOT이 삭제되었습니다');
        } catch (e) {
          console.error('Delete error:', e);
          showToast('삭제 실패: ' + (e?.message || 'unknown'), 'error');
        }
      }
    });
  };

  const filteredLots = lots.filter(l => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      l.lotNumber?.toLowerCase().includes(term) ||
      l.intermediateLotNumber?.toLowerCase().includes(term) ||
      l.tempId?.toLowerCase().includes(term) ||
      l.proteinName?.toLowerCase().includes(term) ||
      l.intermediateName?.toLowerCase().includes(term) ||
      l.operator?.toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'All' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedLot = lots.find(l => l.id === selectedLotId);

  // ============== Render ==============
  return (
    <div style={{
      fontFamily: '"Inter", "Pretendard", -apple-system, BlinkMacSystemFont, sans-serif',
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
      color: '#0f172a'
    }}>
      <style>{`
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; border: none; background: none; }
        input, textarea, select { font-family: inherit; }
        .scroll-area::-webkit-scrollbar { width: 8px; height: 8px; }
        .scroll-area::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        padding: '20px 32px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44,
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FlaskConical size={24} color="white" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Protein Production Manager
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                Expi293F · FAM19A5 · LOT Tracking System
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 8,
              fontSize: 12,
              color: '#cbd5e1',
              display: 'flex', gap: 10, flexWrap: 'wrap'
            }}>
              <span>중간체: <strong style={{ color: '#c4b5fd' }}>{lots.filter(l => l.intermediateLotNumber).length}</strong></span>
              <span style={{ color: '#475569' }}>·</span>
              <span>최종: <strong style={{ color: '#67e8f9' }}>{lots.filter(l => l.lotNumber).length}</strong></span>
              <span style={{ color: '#475569' }}>·</span>
              <span>진행 중: <strong style={{ color: '#fbbf24' }}>{lots.filter(l => !l.lotNumber && !l.intermediateLotNumber).length}</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <Beaker size={40} style={{ animation: 'fadeIn 1.5s ease infinite alternate' }} />
            <p>저장된 LOT 데이터를 불러오는 중...</p>
          </div>
        ) : view === 'list' ? (
          <ListView
            lots={filteredLots}
            allCount={lots.length}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onSelect={(id) => { setSelectedLotId(id); setView('detail'); }}
            onNew={() => setView('new')}
          />
        ) : view === 'new' ? (
          <NewLotForm
            existingLots={lots}
            onCancel={() => setView('list')}
            onCreate={async (lot) => {
              const id = await saveLot(lot);
              setSelectedLotId(id);
              setView('detail');
            }}
          />
        ) : view === 'detail' && selectedLot ? (
          <DetailView
            lot={selectedLot}
            onSave={async (updated) => { await saveLot({ ...updated, id: selectedLot.id }); }}
            onBack={() => { setView('list'); setSelectedLotId(null); }}
            onDelete={() => deleteLot(selectedLot.id)}
          />
        ) : null}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24, right: 24,
          padding: '12px 20px',
          background: toast.type === 'error' ? '#ef4444' : '#0f172a',
          color: 'white',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.3s ease',
          zIndex: 1000
        }}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          danger={confirmDialog.danger}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={async () => {
            const fn = confirmDialog.onConfirm;
            setConfirmDialog(null);
            if (fn) await fn();
          }}
        />
      )}
    </div>
  );
}

// ============== Confirm Dialog ==============
function ConfirmDialog({ title, message, danger, onCancel, onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
      animation: 'fadeIn 0.15s ease',
      padding: 20
    }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 14,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          animation: 'slideIn 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36,
            background: danger ? '#fee2e2' : '#fef3c7',
            color: danger ? '#dc2626' : '#d97706',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <AlertCircle size={20} />
          </div>
          <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a' }}>{title}</h3>
        </div>
        <p style={{
          margin: '0 0 20px',
          fontSize: 14,
          color: '#475569',
          lineHeight: 1.5,
          whiteSpace: 'pre-line'
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...btnStyle,
              background: danger ? '#dc2626' : '#3b82f6',
              color: 'white'
            }}
          >
            {danger ? <><Trash2 size={14} /> 삭제</> : <><CheckCircle2 size={14} /> 확인</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== List View ==============
function ListView({ lots, allCount, searchTerm, setSearchTerm, statusFilter, setStatusFilter, onSelect, onNew }) {
  // Quick stats
  const stats = {
    total: allCount,
    inProgress: lots.filter(l => l.status === 'In Progress').length,
    passed: lots.filter(l => l.status === 'QC Passed' || l.status === 'Released').length,
    failed: lots.filter(l => l.status === 'QC Failed').length
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Stats cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <StatCard label="전체 LOT" value={stats.total} icon={Layers} color="#3b82f6" />
        <StatCard label="진행 중" value={stats.inProgress} icon={Clock} color="#f59e0b" />
        <StatCard label="QC 합격" value={stats.passed} icon={CheckCircle2} color="#22c55e" />
        <StatCard label="QC 불합격" value={stats.failed} icon={AlertCircle} color="#ef4444" />
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 12,
        marginBottom: 20,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{
          flex: '1 1 280px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search size={16} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="LOT 번호 (중간체/최종), 임시 ID, 단백질, 작업자로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              fontSize: 14,
              background: 'white',
              outline: 'none'
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontSize: 14,
            background: 'white',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option>All</option>
          <option>In Progress</option>
          <option>QC Passed</option>
          <option>QC Failed</option>
          <option>Released</option>
        </select>
        <button
          onClick={onNew}
          style={{
            padding: '10px 18px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            color: 'white',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(59,130,246,0.25)'
          }}
        >
          <Plus size={16} /> 새 LOT 등록
        </button>
      </div>

      {/* LOT cards */}
      {lots.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 60,
          textAlign: 'center',
          border: '2px dashed #e2e8f0'
        }}>
          <FlaskConical size={48} style={{ color: '#cbd5e1', marginBottom: 12 }} />
          <h3 style={{ margin: 0, color: '#475569' }}>등록된 LOT이 없습니다</h3>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6 }}>
            "새 LOT 등록" 버튼을 눌러 첫 단백질 정제 기록을 시작하세요.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16
        }}>
          {lots.map(lot => <LotCard key={lot.id} lot={lot} onClick={() => onSelect(lot.id)} />)}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 14,
      padding: 18,
      border: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }}>
      <div style={{
        width: 44, height: 44,
        background: `${color}15`,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function LotCard({ lot, onClick }) {
  const style = STATUS_STYLES[lot.status] || STATUS_STYLES['In Progress'];
  const StatusIcon = style.icon;

  // Progress estimate
  const stages = [
    !!lot.production?.harvestDate,
    !!lot.purification?.purificationDate,
    !!(lot.concentration?.first?.endDate || lot.concentration?.first?.startDate),
    !!lot.tevCleavage?.date,
    !!(lot.concentration?.second?.endDate || lot.concentration?.second?.startDate),
    !!lot.qc?.coomassie?.date || !!lot.qc?.westernBlot?.date,
    !!lot.qc?.elisa?.date
  ];
  const progress = Math.round((stages.filter(Boolean).length / stages.length) * 100);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white',
        borderRadius: 14,
        padding: 18,
        border: '1px solid #e2e8f0',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex', flexDirection: 'column', gap: 12
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(59,130,246,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {lot.lotNumber || lot.intermediateLotNumber ? (
            <>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                LOT 번호
              </div>
              {lot.intermediateLotNumber && (
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, marginRight: 6 }}>중간체</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {lot.intermediateLotNumber}
                  </span>
                </div>
              )}
              {lot.lotNumber && (
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, marginRight: 6 }}>최종</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {lot.lotNumber}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 }}>
                {lot.tempId}
              </div>
            </>
          ) : (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 10, fontWeight: 700,
                padding: '2px 7px',
                background: '#fef3c7', color: '#92400e',
                borderRadius: 4, letterSpacing: '0.05em',
                marginBottom: 4
              }}>
                <Clock size={10} /> 임시 식별자
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                {lot.tempId || '—'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                LOT 번호 미지정
              </div>
            </>
          )}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: style.bg,
          color: style.text,
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0
        }}>
          <StatusIcon size={12} />
          {lot.status}
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#334155' }}>
        <span style={{ color: '#7c3aed', fontWeight: 600 }}>{lot.intermediateName || 'His-TEV FAM19A5'}</span>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>→</span>
        <span style={{ color: '#0891b2', fontWeight: 600 }}>{lot.proteinName}</span>
      </div>

      <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12 }}>
        <span><Calendar size={11} style={{ display: 'inline', marginRight: 3 }} /> {lot.createdAt}</span>
        {lot.operator && <span>· {lot.operator}</span>}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
          <span>진행률</span>
          <span style={{ fontWeight: 600 }}>{progress}%</span>
        </div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
            borderRadius: 4,
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      {(lot.concentration?.first?.totalYield_mg || lot.concentration?.second?.totalYield_mg) && (
        <div style={{
          padding: '8px 10px',
          background: '#f8fafc',
          borderRadius: 8,
          fontSize: 12,
          color: '#475569',
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {lot.concentration?.first?.totalYield_mg && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#7c3aed' }}>중간체 수율</span>
              <strong>{lot.concentration.first.totalYield_mg} mg</strong>
            </div>
          )}
          {lot.concentration?.second?.totalYield_mg && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#0891b2' }}>최종 수율</span>
              <strong>{lot.concentration.second.totalYield_mg} mg</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============== New LOT Form ==============
function NewLotForm({ existingLots, onCancel, onCreate }) {
  const [tempId] = useState(() => generateTempId(existingLots));
  const [intermediateName, setIntermediateName] = useState('His-TEV FAM19A5');
  const [proteinName, setProteinName] = useState('rcFAM19A5');
  const [operator, setOperator] = useState('');

  const handleCreate = () => {
    const lot = newLotTemplate(tempId);
    lot.intermediateName = intermediateName;
    lot.proteinName = proteinName;
    lot.operator = operator;
    onCreate(lot);
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', maxWidth: 600, margin: '40px auto' }}>
      <button onClick={onCancel} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        color: '#64748b', fontSize: 14, marginBottom: 16
      }}>
        <ChevronLeft size={16} /> 목록으로
      </button>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 32,
        border: '1px solid #e2e8f0'
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#0f172a' }}>새 생산 batch 등록</h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
          생산 시작 시점에는 임시 식별자가 자동 부여됩니다.<br />
          정식 LOT 번호는 중간체(농축 후)와 최종 산물(TEV cleavage 후) 각각에 별도로 부여됩니다.
        </p>

        <FormField label="임시 식별자 (자동 생성)">
          <div style={{
            padding: '12px 14px',
            background: '#fef3c7',
            borderRadius: 8,
            fontSize: 15,
            fontFamily: 'monospace',
            fontWeight: 700,
            color: '#92400e',
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid #fde68a'
          }}>
            <Clock size={16} /> {tempId}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            형식: TEMP-YYYY-MMDD-순번(A,B,C…)
          </div>
        </FormField>
        <FormField label="중간체 (정제 후)">
          <input value={intermediateName} onChange={(e) => setIntermediateName(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="최종 산물 (TEV cleavage 후)">
          <input value={proteinName} onChange={(e) => setProteinName(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="담당자">
          <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="예: 최현재" style={inputStyle} />
        </FormField>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>
            취소
          </button>
          <button onClick={handleCreate} style={{ ...btnStyle, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', color: 'white', flex: 1 }}>
            <Plus size={16} style={{ marginRight: 4 }} /> 생산 batch 시작
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Detail View ==============
function DetailView({ lot, onSave, onBack, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lot);
  const [activeTab, setActiveTab] = useState('overview');
  const [lotModalType, setLotModalType] = useState(null); // 'intermediate' | 'final' | null

  useEffect(() => { setDraft(lot); }, [lot.id]);

  const handleSave = async () => {
    await onSave(draft);
    setEditing(false);
  };

  const assignLotNumber = async (type, lotNumber, assignedBy) => {
    const updated = { ...draft };
    if (type === 'intermediate') {
      updated.intermediateLotNumber = lotNumber.trim();
      updated.intermediateLotAssignedAt = todayISO();
      updated.intermediateLotAssignedBy = assignedBy.trim();
    } else {
      updated.lotNumber = lotNumber.trim();
      updated.lotNumberAssignedAt = todayISO();
      updated.lotNumberAssignedBy = assignedBy.trim();
    }
    setDraft(updated);
    await onSave(updated);
    setLotModalType(null);
  };

  const update = (path, value) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const [uploadError, setUploadError] = useState('');

  const handleImageUpload = (path) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('이미지는 2MB 이하여야 합니다');
      setTimeout(() => setUploadError(''), 3500);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => update(path, ev.target.result);
    reader.readAsDataURL(file);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(lot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lot.lotNumber || lot.intermediateLotNumber || lot.tempId || 'lot'}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const style = STATUS_STYLES[draft.status] || STATUS_STYLES['In Progress'];
  const hasIntermediateLot = !!draft.intermediateLotNumber;
  const hasFinalLot = !!draft.lotNumber;

  const tabs = [
    { id: 'overview', label: '개요', icon: FileText },
    { id: 'production', label: '생산', icon: FlaskConical },
    { id: 'purification', label: '정제', icon: Droplet },
    { id: 'concentration', label: '농축', icon: Activity },
    { id: 'tev', label: 'TEV Cleavage', icon: Microscope },
    { id: 'qc', label: 'QC 분석', icon: BarChart3 },
    { id: 'storage', label: '보관', icon: Layers }
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        color: '#64748b', fontSize: 14, marginBottom: 16
      }}>
        <ChevronLeft size={16} /> 목록으로
      </button>

      {/* Detail header */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 24,
        border: '1px solid #e2e8f0',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Temp ID:
              </span>
              <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                {draft.tempId}
              </span>
            </div>

            {/* Process flow */}
            <div style={{
              display: 'flex', alignItems: 'stretch', gap: 12,
              marginTop: 12, flexWrap: 'wrap'
            }}>
              {/* Intermediate */}
              <div style={{
                flex: 1, minWidth: 200,
                padding: '12px 14px',
                background: hasIntermediateLot ? 'linear-gradient(135deg, #f5f3ff, #ede9fe)' : '#fafafa',
                border: `1px solid ${hasIntermediateLot ? '#ddd6fe' : '#e2e8f0'}`,
                borderRadius: 10
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#7c3aed',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4
                }}>
                  중간체 (Intermediate)
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  {draft.intermediateName}
                </div>
                {hasIntermediateLot ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                      {draft.intermediateLotNumber}
                    </div>
                    {draft.intermediateLotAssignedAt && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {draft.intermediateLotAssignedAt} · {draft.intermediateLotAssignedBy}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    LOT 미부여
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: 18
              }}>→</div>

              {/* Final */}
              <div style={{
                flex: 1, minWidth: 200,
                padding: '12px 14px',
                background: hasFinalLot ? 'linear-gradient(135deg, #ecfeff, #cffafe)' : '#fafafa',
                border: `1px solid ${hasFinalLot ? '#a5f3fc' : '#e2e8f0'}`,
                borderRadius: 10
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#0891b2',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4
                }}>
                  최종 산물 (Final Product)
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  {draft.proteinName}
                </div>
                {hasFinalLot ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                      {draft.lotNumber}
                    </div>
                    {draft.lotNumberAssignedAt && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {draft.lotNumberAssignedAt} · {draft.lotNumberAssignedBy}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    LOT 미부여
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#475569', marginTop: 14 }}>
              {draft.expressionSystem} · 작업자: {draft.operator || '—'}
              {draft.reviewer && ` · 검토자: ${draft.reviewer}`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {editing ? (
              <>
                <select
                  value={draft.status}
                  onChange={(e) => update('status', e.target.value)}
                  style={{ ...inputStyle, padding: '8px 12px', width: 'auto', marginBottom: 0 }}
                >
                  <option>In Progress</option>
                  <option>QC Passed</option>
                  <option>QC Failed</option>
                  <option>Released</option>
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setDraft(lot); setEditing(false); }} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>
                    <X size={14} /> 취소
                  </button>
                  <button onClick={handleSave} style={{ ...btnStyle, background: '#22c55e', color: 'white' }}>
                    <Save size={14} /> 저장
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '8px 14px',
                  background: style.bg, color: style.text,
                  borderRadius: 8, fontSize: 13, fontWeight: 600
                }}>
                  <style.icon size={14} /> {draft.status}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!hasIntermediateLot && (
                    <button
                      onClick={() => setLotModalType('intermediate')}
                      style={{ ...btnStyle, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white' }}
                    >
                      <Hash size={13} /> 중간체 LOT 부여
                    </button>
                  )}
                  {!hasFinalLot && (
                    <button
                      onClick={() => setLotModalType('final')}
                      style={{ ...btnStyle, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white' }}
                    >
                      <Hash size={13} /> 최종 LOT 부여
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={exportJSON} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>
                    <FileDown size={13} /> JSON
                  </button>
                  <button onClick={() => setEditing(true)} style={{ ...btnStyle, background: '#3b82f6', color: 'white' }}>
                    <Edit3 size={13} /> 편집
                  </button>
                  <button onClick={onDelete} style={{ ...btnStyle, background: '#fee2e2', color: '#991b1b' }}>
                    <Trash2 size={13} /> 삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {uploadError && (
        <div style={{
          padding: '10px 14px',
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: 10,
          fontSize: 13,
          color: '#991b1b',
          marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={14} /> {uploadError}
        </div>
      )}
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 6,
        border: '1px solid #e2e8f0',
        marginBottom: 16,
        display: 'flex', gap: 4,
        overflowX: 'auto'
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              background: activeTab === t.id ? 'linear-gradient(135deg, #0f172a, #334155)' : 'transparent',
              color: activeTab === t.id ? 'white' : '#64748b',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s'
            }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 28,
        border: '1px solid #e2e8f0'
      }}>
        {activeTab === 'overview' && <OverviewTab lot={draft} editing={editing} update={update} />}
        {activeTab === 'production' && <ProductionTab lot={draft} editing={editing} update={update} />}
        {activeTab === 'purification' && <PurificationTab lot={draft} editing={editing} update={update} />}
        {activeTab === 'concentration' && <ConcentrationTab lot={draft} editing={editing} update={update} />}
        {activeTab === 'tev' && <TevTab lot={draft} editing={editing} update={update} />}
        {activeTab === 'qc' && <QcTab lot={draft} editing={editing} update={update} handleImageUpload={handleImageUpload} />}
        {activeTab === 'storage' && <StorageTab lot={draft} editing={editing} update={update} />}
      </div>

      {lotModalType && (
        <AssignLotModal
          type={lotModalType}
          tempId={draft.tempId}
          existingLot={draft}
          onCancel={() => setLotModalType(null)}
          onConfirm={(num, by) => assignLotNumber(lotModalType, num, by)}
        />
      )}
    </div>
  );
}

// ============== Assign LOT Modal ==============
function AssignLotModal({ type, tempId, existingLot, onCancel, onConfirm }) {
  const isIntermediate = type === 'intermediate';

  // YYMMDD format
  // 중간체: 1차 농축 종료일 / 최종: 2차 농축 종료일 (없으면 오늘)
  const refDateStr = isIntermediate
    ? (existingLot.concentration?.first?.endDate || existingLot.concentration?.first?.startDate || todayISO())
    : (existingLot.concentration?.second?.endDate || existingLot.concentration?.second?.startDate || todayISO());
  const d = new Date(refDateStr);
  const yymmdd = isNaN(d.getTime())
    ? todayISO().slice(2).replace(/-/g, '')
    : `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  // Defaults — 사내 규칙: His-TEV-FAM19A5_#YYMMDD / rcFAM19A5_#YYMMDD
  const baseName = isIntermediate
    ? (existingLot.intermediateName || 'His-TEV-FAM19A5').replace(/\s+/g, '-')
    : (existingLot.proteinName || 'rcFAM19A5').replace(/\s+/g, '-');
  const [lotNumber, setLotNumber] = useState(`${baseName}_#${yymmdd}`);
  const [assignedBy, setAssignedBy] = useState(existingLot.reviewer || existingLot.operator || '');

  // Readiness check
  let readinessOK, readinessMsg, currentStage;
  if (isIntermediate) {
    readinessOK = !!existingLot.concentration?.first?.totalYield_mg;
    currentStage = readinessOK ? '1차 농축 완료' : '1차 농축 미완료';
    readinessMsg = '중간체 LOT은 1차 농축 & buffer exchange 완료 후 부여하는 것을 권장합니다.';
  } else {
    const secondConcDone = !!existingLot.concentration?.second?.totalYield_mg;
    const qcPassed = existingLot.status === 'QC Passed' || existingLot.status === 'Released';
    readinessOK = secondConcDone && qcPassed;
    currentStage = !secondConcDone ? '2차 농축 미완료' : !qcPassed ? `QC 미통과 (${existingLot.status})` : 'QC 통과';
    readinessMsg = '최종 LOT은 2차 농축 완료 및 QC Passed 상태에서 부여하는 것을 권장합니다.';
  }

  const color = isIntermediate
    ? { bg: 'linear-gradient(135deg, #a855f7, #7c3aed)', label: '중간체', hex: '#7c3aed' }
    : { bg: 'linear-gradient(135deg, #06b6d4, #0891b2)', label: '최종 산물', hex: '#0891b2' };

  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!lotNumber.trim()) {
      setError('LOT 번호를 입력하세요');
      return;
    }
    setError('');
    onConfirm(lotNumber, assignedBy);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      animation: 'fadeIn 0.15s ease',
      padding: 20
    }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 28,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          animation: 'slideIn 0.2s ease'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16
        }}>
          <div style={{
            width: 40, height: 40,
            background: color.bg,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Hash size={20} color="white" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              {color.label} LOT 번호 부여
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {isIntermediate ? existingLot.intermediateName : existingLot.proteinName} · 부여 후 영구 기록됩니다
            </p>
          </div>
        </div>

        <div style={{
          padding: 12,
          background: '#f8fafc',
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 13,
          color: '#475569'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>임시 ID</span>
            <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{tempId}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>현재 단계</span>
            <strong style={{ color: readinessOK ? '#16a34a' : '#d97706' }}>
              {currentStage} {readinessOK ? '✓' : '⚠'}
            </strong>
          </div>
        </div>

        {!readinessOK && (
          <div style={{
            padding: '10px 12px',
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400e',
            marginBottom: 16,
            display: 'flex', gap: 8, alignItems: 'flex-start'
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{readinessMsg}</span>
          </div>
        )}

        <FormField label={`${color.label} LOT 번호`} required>
          <input
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder={isIntermediate ? '예: His-TEV-FAM19A5_#260210' : '예: rcFAM19A5_#260212'}
            style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600 }}
            autoFocus
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            형식: {isIntermediate ? 'His-TEV-FAM19A5_#YYMMDD' : 'rcFAM19A5_#YYMMDD'}
            {' '}— 날짜는 {isIntermediate ? '1차 농축 종료일' : '2차 농축 종료일'} 기준 자동 생성
          </div>
        </FormField>

        <FormField label="부여자">
          <input
            value={assignedBy}
            onChange={(e) => setAssignedBy(e.target.value)}
            placeholder="이름 또는 사번"
            style={inputStyle}
          />
        </FormField>

        {error && (
          <div style={{
            padding: '8px 12px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            fontSize: 12,
            color: '#991b1b',
            marginTop: 4
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569', flex: 1, justifyContent: 'center' }}>
            취소
          </button>
          <button
            onClick={handleConfirm}
            style={{
              ...btnStyle,
              background: color.bg,
              color: 'white', flex: 2, justifyContent: 'center'
            }}
          >
            <CheckCircle2 size={14} /> LOT 번호 확정 부여
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Tabs ==============
function OverviewTab({ lot, editing, update }) {
  return (
    <div>
      <SectionTitle icon={FileText}>식별 정보</SectionTitle>
      <FormGrid>
        <FormField label="임시 식별자">
          <ReadOnly>{lot.tempId}</ReadOnly>
        </FormField>
        <FormField label="중간체 LOT 번호 (His-TEV)">
          {lot.intermediateLotNumber ? (
            <ReadOnly highlight>{lot.intermediateLotNumber}</ReadOnly>
          ) : (
            <div style={{
              padding: '10px 12px',
              background: '#faf5ff',
              borderRadius: 8,
              fontSize: 13,
              color: '#7c3aed',
              fontStyle: 'italic',
              border: '1px solid #e9d5ff'
            }}>
              미부여 — 헤더의 "중간체 LOT 부여" 버튼 사용
            </div>
          )}
        </FormField>
        <FormField label="최종 LOT 번호 (rcFAM19A5)">
          {lot.lotNumber ? (
            <ReadOnly highlight>{lot.lotNumber}</ReadOnly>
          ) : (
            <div style={{
              padding: '10px 12px',
              background: '#ecfeff',
              borderRadius: 8,
              fontSize: 13,
              color: '#0891b2',
              fontStyle: 'italic',
              border: '1px solid #a5f3fc'
            }}>
              미부여 — 헤더의 "최종 LOT 부여" 버튼 사용
            </div>
          )}
        </FormField>
      </FormGrid>

      {(lot.intermediateLotAssignedAt || lot.lotNumberAssignedAt) && (
        <FormGrid>
          {lot.intermediateLotAssignedAt && (
            <>
              <FormField label="중간체 LOT 부여일">
                <ReadOnly>{lot.intermediateLotAssignedAt}</ReadOnly>
              </FormField>
              <FormField label="중간체 LOT 부여자">
                <ReadOnly>{lot.intermediateLotAssignedBy}</ReadOnly>
              </FormField>
            </>
          )}
          {lot.lotNumberAssignedAt && (
            <>
              <FormField label="최종 LOT 부여일">
                <ReadOnly>{lot.lotNumberAssignedAt}</ReadOnly>
              </FormField>
              <FormField label="최종 LOT 부여자">
                <ReadOnly>{lot.lotNumberAssignedBy}</ReadOnly>
              </FormField>
            </>
          )}
        </FormGrid>
      )}

      <SectionTitle icon={FileText}>기본 정보</SectionTitle>
      <FormGrid>
        <FormField label="중간체 이름">
          {editing ? <input value={lot.intermediateName} onChange={e => update('intermediateName', e.target.value)} style={inputStyle} />
            : <ReadOnly>{lot.intermediateName}</ReadOnly>}
        </FormField>
        <FormField label="최종 산물 이름">
          {editing ? <input value={lot.proteinName} onChange={e => update('proteinName', e.target.value)} style={inputStyle} />
            : <ReadOnly>{lot.proteinName}</ReadOnly>}
        </FormField>
        <FormField label="발현 시스템">
          {editing ? <input value={lot.expressionSystem} onChange={e => update('expressionSystem', e.target.value)} style={inputStyle} />
            : <ReadOnly>{lot.expressionSystem}</ReadOnly>}
        </FormField>
        <FormField label="담당자">
          {editing ? <input value={lot.operator} onChange={e => update('operator', e.target.value)} style={inputStyle} />
            : <ReadOnly>{lot.operator}</ReadOnly>}
        </FormField>
        <FormField label="검토자">
          {editing ? <input value={lot.reviewer} onChange={e => update('reviewer', e.target.value)} style={inputStyle} />
            : <ReadOnly>{lot.reviewer}</ReadOnly>}
        </FormField>
        <FormField label="생성일">
          <ReadOnly>{lot.createdAt}</ReadOnly>
        </FormField>
        <FormField label="최종 수정">
          <ReadOnly>{lot.updatedAt}</ReadOnly>
        </FormField>
      </FormGrid>

      <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <SectionTitle icon={TrendingUp}>요약</SectionTitle>
        <FormGrid>
          <Metric label="중간체 수율 (His-TEV)" value={lot.concentration?.first?.totalYield_mg ? `${lot.concentration.first.totalYield_mg} mg` : '—'} />
          <Metric label="최종 수율 (rcFAM19A5)" value={lot.concentration?.second?.totalYield_mg ? `${lot.concentration.second.totalYield_mg} mg` : '—'} />
          <Metric label="Coomassie 분석" value={lot.qc?.coomassie?.date ? lot.qc.coomassie.date : '—'} />
          <Metric label="ELISA 분석" value={lot.qc?.elisa?.date ? lot.qc.elisa.date : '—'} />
        </FormGrid>
      </div>
    </div>
  );
}

function ProductionTab({ lot, editing, update }) {
  const p = lot.production;
  return (
    <div>
      <SectionTitle icon={FlaskConical}>Cell Seeding & Transfection (Expi293F)</SectionTitle>
      <FormGrid>
        <FormField label="Seeding 날짜">
          <DateInput val={p.cellSeedingDate} edit={editing} on={v => update('production.cellSeedingDate', v)} />
        </FormField>
        <FormField label="Seeding flask 수">
          <NumInput val={p.seedingFlaskCount} edit={editing} on={v => update('production.seedingFlaskCount', v)} />
        </FormField>
        <FormField label="Transfection 날짜">
          <DateInput val={p.transfectionDate} edit={editing} on={v => update('production.transfectionDate', v)} />
        </FormField>
        <FormField label="Transfection flask 수">
          <NumInput val={p.transfectionFlaskCount} edit={editing} on={v => update('production.transfectionFlaskCount', v)} />
        </FormField>
        <FormField label="Plasmid DNA (μg)">
          <NumInput val={p.plasmidAmount_ug} edit={editing} on={v => update('production.plasmidAmount_ug', v)} />
        </FormField>
        <FormField label="Enhancer 처리일">
          <DateInput val={p.enhancerDate} edit={editing} on={v => update('production.enhancerDate', v)} />
        </FormField>
        <FormField label="Harvest 날짜">
          <DateInput val={p.harvestDate} edit={editing} on={v => update('production.harvestDate', v)} />
        </FormField>
        <FormField label="Harvest 부피 (mL)">
          <NumInput val={p.harvestVolume_mL} edit={editing} on={v => update('production.harvestVolume_mL', v)} />
        </FormField>
      </FormGrid>
      <FormField label="비고">
        <TextArea val={p.notes} edit={editing} on={v => update('production.notes', v)} />
      </FormField>
    </div>
  );
}

function PurificationTab({ lot, editing, update }) {
  const p = lot.purification;
  return (
    <div>
      <SectionTitle icon={Droplet}>Ni-NTA IMAC Purification</SectionTitle>
      <FormGrid>
        <FormField label="정제 날짜">
          <DateInput val={p.purificationDate} edit={editing} on={v => update('purification.purificationDate', v)} />
        </FormField>
        <FormField label="Resin">
          <TextInput val={p.resin} edit={editing} on={v => update('purification.resin', v)} />
        </FormField>
        <FormField label="Imidazole gradient">
          <TextInput val={p.imidazoleGradient} edit={editing} on={v => update('purification.imidazoleGradient', v)} />
        </FormField>
        <FormField label="Pool한 fractions (mM)">
          <TextInput val={p.pooledFractions} edit={editing} on={v => update('purification.pooledFractions', v)} placeholder="예: 100, 300, 500" />
        </FormField>
      </FormGrid>
      <FormField label="비고">
        <TextArea val={p.notes} edit={editing} on={v => update('purification.notes', v)} />
      </FormField>
    </div>
  );
}

function ConcentrationTab({ lot, editing, update }) {
  const c1 = lot.concentration.first;
  const c2 = lot.concentration.second;

  // 1차 농축 자동 수율 계산
  useEffect(() => {
    if (editing && c1.nanodropConc_mg_mL && c1.finalVolume_mL) {
      const y = (parseFloat(c1.nanodropConc_mg_mL) * parseFloat(c1.finalVolume_mL)).toFixed(3);
      if (!isNaN(y) && y !== c1.totalYield_mg) update('concentration.first.totalYield_mg', y);
    }
  }, [c1.nanodropConc_mg_mL, c1.finalVolume_mL, editing]);

  // 2차 농축 자동 수율 계산
  useEffect(() => {
    if (editing && c2.nanodropConc_mg_mL && c2.finalVolume_mL) {
      const y = (parseFloat(c2.nanodropConc_mg_mL) * parseFloat(c2.finalVolume_mL)).toFixed(3);
      if (!isNaN(y) && y !== c2.totalYield_mg) update('concentration.second.totalYield_mg', y);
    }
  }, [c2.nanodropConc_mg_mL, c2.finalVolume_mL, editing]);

  return (
    <div>
      {/* 1차 농축 */}
      <div style={{
        padding: 16,
        background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)',
        border: '1px solid #e9d5ff',
        borderRadius: 12,
        marginBottom: 20
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12, paddingBottom: 10,
          borderBottom: '1px solid #e9d5ff'
        }}>
          <div style={{
            padding: '3px 8px',
            background: '#7c3aed', color: 'white',
            borderRadius: 4, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.05em'
          }}>1차 농축</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#581c87' }}>
            Ni-NTA 정제 후 → His-TEV FAM19A5
          </span>
          <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 'auto' }}>
            E1%: 11.32
          </span>
        </div>

        <FormGrid>
          <FormField label="시작 날짜">
            <DateInput val={c1.startDate} edit={editing} on={v => update('concentration.first.startDate', v)} />
          </FormField>
          <FormField label="종료 날짜">
            <DateInput val={c1.endDate} edit={editing} on={v => update('concentration.first.endDate', v)} />
          </FormField>
          <FormField label="Filter device">
            <TextInput val={c1.filterDevice} edit={editing} on={v => update('concentration.first.filterDevice', v)} />
          </FormField>
          <FormField label="Buffer exchange 횟수">
            <NumInput val={c1.bufferExchangeCycles} edit={editing} on={v => update('concentration.first.bufferExchangeCycles', v)} />
          </FormField>
          <FormField label="최종 buffer">
            <TextInput val={c1.finalBuffer} edit={editing} on={v => update('concentration.first.finalBuffer', v)} />
          </FormField>
          <FormField label="Nanodrop 농도 (mg/mL)">
            <NumInput val={c1.nanodropConc_mg_mL} edit={editing} on={v => update('concentration.first.nanodropConc_mg_mL', v)} step="0.01" />
          </FormField>
          <FormField label="E1% (1%, 1cm)">
            <NumInput val={c1.e1pct} edit={editing} on={v => update('concentration.first.e1pct', v)} step="0.01" />
          </FormField>
          <FormField label="최종 부피 (mL)">
            <NumInput val={c1.finalVolume_mL} edit={editing} on={v => update('concentration.first.finalVolume_mL', v)} step="0.01" />
          </FormField>
          <FormField label="총 수율 (mg) — 자동 계산">
            <ReadOnly highlight>{c1.totalYield_mg || '—'}</ReadOnly>
          </FormField>
        </FormGrid>
        <FormField label="비고">
          <TextArea val={c1.notes} edit={editing} on={v => update('concentration.first.notes', v)} />
        </FormField>
      </div>

      {/* 2차 농축 */}
      <div style={{
        padding: 16,
        background: 'linear-gradient(135deg, #ecfeff, #cffafe)',
        border: '1px solid #a5f3fc',
        borderRadius: 12
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12, paddingBottom: 10,
          borderBottom: '1px solid #a5f3fc'
        }}>
          <div style={{
            padding: '3px 8px',
            background: '#0891b2', color: 'white',
            borderRadius: 4, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.05em'
          }}>2차 농축</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#164e63' }}>
            TEV cleavage 후 → rcFAM19A5
          </span>
          <span style={{ fontSize: 11, color: '#0891b2', marginLeft: 'auto' }}>
            E1%: 11.67
          </span>
        </div>

        <FormGrid>
          <FormField label="시작 날짜">
            <DateInput val={c2.startDate} edit={editing} on={v => update('concentration.second.startDate', v)} />
          </FormField>
          <FormField label="종료 날짜">
            <DateInput val={c2.endDate} edit={editing} on={v => update('concentration.second.endDate', v)} />
          </FormField>
          <FormField label="Filter device">
            <TextInput val={c2.filterDevice} edit={editing} on={v => update('concentration.second.filterDevice', v)} />
          </FormField>
          <FormField label="Buffer exchange 횟수">
            <NumInput val={c2.bufferExchangeCycles} edit={editing} on={v => update('concentration.second.bufferExchangeCycles', v)} />
          </FormField>
          <FormField label="최종 buffer">
            <TextInput val={c2.finalBuffer} edit={editing} on={v => update('concentration.second.finalBuffer', v)} />
          </FormField>
          <FormField label="Nanodrop 농도 (mg/mL)">
            <NumInput val={c2.nanodropConc_mg_mL} edit={editing} on={v => update('concentration.second.nanodropConc_mg_mL', v)} step="0.01" />
          </FormField>
          <FormField label="E1% (1%, 1cm)">
            <NumInput val={c2.e1pct} edit={editing} on={v => update('concentration.second.e1pct', v)} step="0.01" />
          </FormField>
          <FormField label="최종 부피 (mL)">
            <NumInput val={c2.finalVolume_mL} edit={editing} on={v => update('concentration.second.finalVolume_mL', v)} step="0.01" />
          </FormField>
          <FormField label="총 수율 (mg) — 자동 계산">
            <ReadOnly highlight>{c2.totalYield_mg || '—'}</ReadOnly>
          </FormField>
        </FormGrid>
        <FormField label="비고">
          <TextArea val={c2.notes} edit={editing} on={v => update('concentration.second.notes', v)} />
        </FormField>
      </div>
    </div>
  );
}

function TevTab({ lot, editing, update }) {
  const t = lot.tevCleavage;

  return (
    <div>
      <SectionTitle icon={Microscope}>TEV Cleavage & 6×His Tag Removal</SectionTitle>
      <div style={{
        padding: '10px 14px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        fontSize: 12,
        color: '#64748b',
        marginBottom: 16,
        lineHeight: 1.5
      }}>
        TEV protease로 His tag를 절단하는 단계입니다. 절단 후 농축 결과는 <strong>농축 탭의 "2차 농축"</strong>에 기록하세요.
      </div>
      <FormGrid>
        <FormField label="진행 날짜">
          <DateInput val={t.date} edit={editing} on={v => update('tevCleavage.date', v)} />
        </FormField>
        <FormField label="Input protein (mg)">
          <NumInput val={t.inputProtein_mg} edit={editing} on={v => update('tevCleavage.inputProtein_mg', v)} step="0.01" />
        </FormField>
        <FormField label="TEV Protease (μL)">
          <NumInput val={t.tevProtease_uL} edit={editing} on={v => update('tevCleavage.tevProtease_uL', v)} />
        </FormField>
        <FormField label="반응 조건">
          <TextInput val={t.incubationCondition} edit={editing} on={v => update('tevCleavage.incubationCondition', v)} />
        </FormField>
      </FormGrid>
      <FormField label="비고">
        <TextArea val={t.notes} edit={editing} on={v => update('tevCleavage.notes', v)} />
      </FormField>
    </div>
  );
}

function QcTab({ lot, editing, update, handleImageUpload }) {
  const [qcTab, setQcTab] = useState('coomassie');
  const qc = lot.qc;

  const sections = [
    { id: 'coomassie', label: 'Coomassie Blue', icon: ImageIcon, key: 'coomassie' },
    { id: 'western',   label: 'Western Blot',  icon: ImageIcon, key: 'westernBlot' },
    { id: 'conc',      label: '농도 측정',       icon: Activity,  key: 'concentrationQC' },
    { id: 'elisa',     label: 'ELISA Affinity', icon: BarChart3, key: 'elisa' }
  ];

  const active = sections.find(s => s.id === qcTab);
  const data = qc[active.key];
  const basePath = `qc.${active.key}`;

  return (
    <div>
      <SectionTitle icon={BarChart3}>Quality Control 분석</SectionTitle>

      <div style={{
        padding: '10px 14px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        fontSize: 12,
        color: '#64748b',
        marginBottom: 16,
        lineHeight: 1.5
      }}>
        각 QC 항목마다 <strong style={{ color: '#7c3aed' }}>중간체 (His-TEV FAM19A5)</strong> 와{' '}
        <strong style={{ color: '#0891b2' }}>최종 산물 (rcFAM19A5)</strong>의 이미지를 각각 업로드하세요.
      </div>

      <div style={{
        display: 'flex', gap: 6,
        background: '#f8fafc',
        padding: 6,
        borderRadius: 10,
        marginBottom: 20
      }}>
        {sections.map(t => (
          <button
            key={t.id}
            onClick={() => setQcTab(t.id)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              display: 'flex', alignItems: 'center', gap: 5,
              background: qcTab === t.id ? 'white' : 'transparent',
              color: qcTab === t.id ? '#0f172a' : '#64748b',
              boxShadow: qcTab === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              flex: 1, justifyContent: 'center'
            }}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <FormField label="분석 날짜">
        <DateInput val={data.date} edit={editing} on={v => update(`${basePath}.date`, v)} />
      </FormField>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
        marginTop: 16,
        marginBottom: 16
      }}>
        <SampleImageBox
          kind="intermediate"
          label="His-TEV FAM19A5 (중간체)"
          imageDataUrl={data.intermediate?.imageDataUrl}
          editing={editing}
          onUpload={handleImageUpload(`${basePath}.intermediate.imageDataUrl`)}
          onClear={() => update(`${basePath}.intermediate.imageDataUrl`, '')}
        />
        <SampleImageBox
          kind="final"
          label="rcFAM19A5 (최종 산물)"
          imageDataUrl={data.final?.imageDataUrl}
          editing={editing}
          onUpload={handleImageUpload(`${basePath}.final.imageDataUrl`)}
          onClear={() => update(`${basePath}.final.imageDataUrl`, '')}
        />
      </div>

      <FormField label="비고">
        <TextArea val={data.notes} edit={editing} on={v => update(`${basePath}.notes`, v)} />
      </FormField>
    </div>
  );
}

// Sample image box — colored container for one sample's image (intermediate vs final)
function SampleImageBox({ kind, label, imageDataUrl, editing, onUpload, onClear }) {
  const isInt = kind === 'intermediate';
  const styles = isInt
    ? { bg: 'linear-gradient(135deg, #faf5ff, #f5f3ff)', border: '#e9d5ff', tag: '#7c3aed', title: '#581c87' }
    : { bg: 'linear-gradient(135deg, #ecfeff, #cffafe)', border: '#a5f3fc', tag: '#0891b2', title: '#164e63' };
  const tagLabel = isInt ? '중간체' : '최종';

  return (
    <div style={{
      padding: 14,
      background: styles.bg,
      border: `1px solid ${styles.border}`,
      borderRadius: 10
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, paddingBottom: 8,
        borderBottom: `1px solid ${styles.border}`
      }}>
        <div style={{
          padding: '2px 8px',
          background: styles.tag, color: 'white',
          borderRadius: 4, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.05em'
        }}>{tagLabel}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: styles.title }}>{label}</span>
      </div>

      {imageDataUrl ? (
        <div style={{ position: 'relative' }}>
          <img
            src={imageDataUrl}
            alt={label}
            style={{
              width: '100%',
              maxHeight: 340,
              objectFit: 'contain',
              borderRadius: 8,
              border: '1px solid white',
              background: 'white',
              display: 'block'
            }}
          />
          {editing && (
            <button
              onClick={onClear}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(239,68,68,0.95)', color: 'white',
                padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <Trash2 size={11} /> 삭제
            </button>
          )}
        </div>
      ) : (
        <div style={{
          padding: 24,
          border: `2px dashed ${styles.border}`,
          borderRadius: 8,
          textAlign: 'center',
          color: styles.tag,
          background: 'rgba(255,255,255,0.5)',
          minHeight: 140,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6
        }}>
          <ImageIcon size={28} style={{ opacity: 0.6 }} />
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {editing ? '이미지를 업로드하세요' : '업로드된 이미지가 없습니다'}
          </div>
        </div>
      )}

      {editing && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 10, padding: '7px 12px',
          background: styles.tag, color: 'white', fontSize: 12,
          borderRadius: 7, cursor: 'pointer', fontWeight: 500
        }}>
          <Upload size={12} /> 이미지 {imageDataUrl ? '교체' : '업로드'}
          <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );
}

function StorageTab({ lot, editing, update }) {
  const s = lot.storage;
  return (
    <div>
      <SectionTitle icon={Layers}>Aliquot & 보관</SectionTitle>
      <FormGrid>
        <FormField label="Aliquot 부피 (μL)">
          <NumInput val={s.aliquotVolume_uL} edit={editing} on={v => update('storage.aliquotVolume_uL', v)} />
        </FormField>
        <FormField label="Aliquot 개수">
          <NumInput val={s.aliquotCount} edit={editing} on={v => update('storage.aliquotCount', v)} />
        </FormField>
        <FormField label="보관 온도">
          <TextInput val={s.storageTemp} edit={editing} on={v => update('storage.storageTemp', v)} />
        </FormField>
        <FormField label="보관 위치">
          <TextInput val={s.storageLocation} edit={editing} on={v => update('storage.storageLocation', v)} placeholder="예: -80℃ Freezer A, Rack 3, Box 12" />
        </FormField>
      </FormGrid>
      <FormField label="비고">
        <TextArea val={s.notes} edit={editing} on={v => update('storage.notes', v)} />
      </FormField>
    </div>
  );
}

// ============== Reusable bits ==============
function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 style={{
      margin: '0 0 16px',
      fontSize: 15,
      fontWeight: 700,
      color: '#0f172a',
      display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: 10,
      borderBottom: '1px solid #e2e8f0'
    }}>
      <Icon size={16} /> {children}
    </h3>
  );
}

function FormGrid({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 14,
      marginBottom: 16
    }}>{children}</div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 600,
        color: '#475569',
        marginBottom: 6,
        letterSpacing: '0.01em'
      }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadOnly({ children, highlight }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: highlight ? '#eff6ff' : '#f8fafc',
      borderRadius: 8,
      fontSize: 14,
      color: highlight ? '#1e40af' : '#1e293b',
      fontWeight: highlight ? 600 : 400,
      minHeight: 40,
      display: 'flex',
      alignItems: 'center',
      border: highlight ? '1px solid #bfdbfe' : '1px solid transparent'
    }}>
      {children || <span style={{ color: '#94a3b8' }}>—</span>}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function TextInput({ val, edit, on, placeholder }) {
  return edit
    ? <input value={val || ''} onChange={e => on(e.target.value)} placeholder={placeholder} style={inputStyle} />
    : <ReadOnly>{val}</ReadOnly>;
}
function NumInput({ val, edit, on, step }) {
  return edit
    ? <input type="number" step={step || '1'} value={val || ''} onChange={e => on(e.target.value)} style={inputStyle} />
    : <ReadOnly>{val}</ReadOnly>;
}
function DateInput({ val, edit, on }) {
  return edit
    ? <input type="date" value={val || ''} onChange={e => on(e.target.value)} style={inputStyle} />
    : <ReadOnly>{val}</ReadOnly>;
}
function TextArea({ val, edit, on }) {
  return edit
    ? <textarea value={val || ''} onChange={e => on(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
    : <ReadOnly>{val}</ReadOnly>;
}
function ResultSelect({ val, edit, on }) {
  if (!edit) {
    if (!val) return <ReadOnly>—</ReadOnly>;
    const color = val === 'Pass' ? '#22c55e' : val === 'Fail' ? '#ef4444' : '#f59e0b';
    const bg = val === 'Pass' ? '#dcfce7' : val === 'Fail' ? '#fee2e2' : '#fef3c7';
    return (
      <div style={{
        padding: '10px 12px', background: bg, color, fontWeight: 600, fontSize: 14,
        borderRadius: 8, display: 'inline-block'
      }}>{val}</div>
    );
  }
  return (
    <select value={val || ''} onChange={e => on(e.target.value)} style={inputStyle}>
      <option value="">— 선택 —</option>
      <option>Pass</option>
      <option>Fail</option>
      <option>Pending</option>
    </select>
  );
}

function ImageUploadField({ label, imageDataUrl, editing, onUpload, onClear }) {
  return (
    <div style={{ marginBottom: 16, marginTop: 8 }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8
      }}>
        {label}
      </label>
      {imageDataUrl ? (
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={imageDataUrl}
            alt={label}
            style={{
              maxWidth: '100%',
              maxHeight: 400,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              display: 'block'
            }}
          />
          {editing && (
            <button
              onClick={onClear}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(239,68,68,0.95)', color: 'white',
                padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <Trash2 size={12} /> 삭제
            </button>
          )}
        </div>
      ) : (
        <div style={{
          padding: 24,
          border: '2px dashed #cbd5e1',
          borderRadius: 10,
          textAlign: 'center',
          color: '#94a3b8',
          background: '#f8fafc'
        }}>
          <ImageIcon size={28} style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 13 }}>
            {editing ? '이미지를 업로드하세요 (최대 2MB)' : '업로드된 이미지가 없습니다'}
          </div>
        </div>
      )}
      {editing && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 10, padding: '8px 14px',
          background: '#0f172a', color: 'white', fontSize: 13,
          borderRadius: 8, cursor: 'pointer', fontWeight: 500
        }}>
          <Upload size={14} /> 이미지 {imageDataUrl ? '교체' : '업로드'}
          <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );
}

// ============== Styles ==============
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  background: 'white',
  color: '#0f172a',
  transition: 'border-color 0.15s'
};

const btnStyle = {
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap'
};
