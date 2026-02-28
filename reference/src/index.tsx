import React, { useState } from 'react';
import {
  Home,
  Library,
  Settings,
  ChevronRight,
  Plus,
  BookOpen,
  Star,
  Search,
  ArrowLeft,
  Image as ImageIcon,
  FileSpreadsheet,
  CheckCircle2,
  TrendingUp,
  Edit2,
  Trash2,
  X,
  Layers,
  LayoutList,
  Rows,
  Sparkles
} from 'lucide-react';

// --- [Curation Data] 전문가 큐레이션 Mock 데이터 ---
const CURATED_THEMES = [
  {
    id: 30,
    title: "핸드메이드 마켓 판매 전략",
    description: "아이디어스, 에티(Etsy) 등 글로벌 플랫폼 입점부터 마케팅까지 실무 어휘.",
    count: 55,
    level: "B2+",
    icon: "🧵",
    category: "Professional"
  },
  {
    id: 36,
    title: "베이킹의 과학: 발효와 화학",
    description: "이스트 활성화와 마이야르 반응 등 파티시에를 위한 고급 영어.",
    count: 60,
    level: "C1",
    icon: "🍰",
    category: "Specialized"
  },
  {
    id: 51,
    title: "공공 행정 및 민원 실무",
    description: "지방 자치 단체 조직 구조와 악성 민원 대응 등 공직 사회 격식 표현.",
    count: 52,
    level: "B2+",
    icon: "🏛️",
    category: "Public Service"
  },
  {
    id: 60,
    title: "글로벌 비즈니스 매너",
    description: "해외 파트너와의 협상 및 식사 에티켓에서 쓰이는 세련된 표현.",
    count: 58,
    level: "B2",
    icon: "🤝",
    category: "Social Issues"
  }
];

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState('detailed'); // 'detailed' or 'compact'

  // [Legacy Data] 기존 단어장 데이터 (기존 방식 유지 - 하단 배치용)
  const [myVocabs, setMyVocabs] = useState([
    { id: 101, title: "업무 관련 필수 단어", count: 48, date: "2024.03.15", type: 'manual' },
    { id: 102, title: "토익 오답 노트 (이미지)", count: 15, date: "2024.03.20", type: 'ocr' }
  ]);

  // 큐레이션 테마를 내 홈 화면의 단어장 리스트로 복제(Clone)하는 로직
  const handleAddFromCuration = (theme) => {
    const newId = `curated_${theme.id}`;
    if (!myVocabs.find(v => v.id === newId)) {
      const today = new Date();
      const dateString = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

      setMyVocabs([{
        id: newId,
        title: theme.title,
        count: theme.count,
        date: dateString,
        type: 'curated',
        icon: theme.icon
      }, ...myVocabs]);
    }
    setSelectedTheme(null);
    setActiveTab('home');
  };

  // 기존 단어장 삭제 로직 유지
  const deleteVocab = (id) => {
    setMyVocabs(myVocabs.filter(v => v.id !== id));
  };

  // --- Screens ---

  const HomeScreen = () => (
    <div className="flex flex-col pb-32 p-6 bg-gray-50 min-h-screen relative overflow-y-auto">
      {/* 메뉴 오픈 시 배경 딤 처리 */}
      {isImportMenuOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[80] transition-all duration-300"
          onClick={() => setIsImportMenuOpen(false)}
        />
      )}

      <header className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">쏙쏙 보카</h1>
          <p className="text-gray-400 text-xs font-medium mt-1 uppercase tracking-widest">Master Dashboard</p>
        </div>
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-purple-600">
          <TrendingUp size={20} />
        </div>
      </header>

      {/* [통합 Section] 개인 단어장 관리 (큐레이션 테마 포함) */}
      <section className="mb-6">
        <div className="flex justify-between items-end mb-5 px-1">
          <h2 className="text-lg font-bold text-gray-800">개인 단어장 관리</h2>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{myVocabs.length} Lists</span>
        </div>
        <div className="space-y-4">
          {myVocabs.map(vocab => (
            <div key={vocab.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between group hover:border-purple-200 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${vocab.type === 'curated' ? 'bg-purple-50 text-2xl' : 'bg-gray-50 text-gray-400'}`}>
                  {vocab.type === 'ocr' ? <ImageIcon size={22} /> :
                    vocab.type === 'curated' ? vocab.icon :
                      <BookOpen size={22} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm">{vocab.title}</h3>
                    {vocab.type === 'curated' && (
                      <span className="bg-purple-100 text-purple-600 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                        <Star size={8} className="fill-purple-600" /> CURATED
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 font-bold uppercase tracking-tighter">{vocab.count} 단어 • {vocab.date}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 text-gray-300 hover:text-blue-500"><Edit2 size={18} /></button>
                <button onClick={() => deleteVocab(vocab.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* [Dual FAB Strategy] 듀얼 버튼 (직관적 접근성) */}
      <div className="fixed bottom-28 right-6 z-[90] flex items-center gap-3">
        {/* Secondary Button: 메뉴 팝업 (사진/엑셀) */}
        <div className="relative">
          {isImportMenuOpen && (
            <div className="absolute bottom-16 right-0 w-48 bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 flex flex-col gap-1 animate-in slide-in-from-bottom-5 duration-200">
              <div className="px-3 py-2 border-b border-gray-50 mb-1">
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Advanced Import</p>
              </div>
              <button className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl transition-colors text-left group">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform"><ImageIcon size={18} /></div>
                <span className="text-xs font-bold text-gray-700">이미지 OCR</span>
              </button>
              <button className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl transition-colors text-left group">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform"><FileSpreadsheet size={18} /></div>
                <span className="text-xs font-bold text-gray-700">엑셀 업로드</span>
              </button>
            </div>
          )}
          <button
            onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${isImportMenuOpen ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 border border-gray-200 hover:border-purple-200'}`}
          >
            {isImportMenuOpen ? <X size={22} /> : <Layers size={22} />}
          </button>
        </div>

        {/* Primary Button: 직접 입력 (1-Click) */}
        <button
          onClick={() => alert("기존 '직접 입력(Manual Input)' 컴포넌트 호출됨")}
          className="h-14 px-6 bg-purple-600 text-white rounded-[24px] flex items-center gap-3 shadow-xl shadow-purple-200 active:scale-95 transition-all"
        >
          <Plus size={24} />
          <span className="font-bold text-sm">직접 추가</span>
        </button>
      </div>
    </div>
  );

  const CurationScreen = () => (
    <div className="flex flex-col pb-32 p-6 bg-gray-50 min-h-screen overflow-y-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">큐레이션</h1>
          <p className="text-gray-400 text-sm mt-1">전문가가 엄선한 명품 테마 💎</p>
        </div>
        {/* 상단 오른쪽 보기 모드 토글 (Detailed/Compact) */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'detailed' ? 'compact' : 'detailed')}
            className="w-11 h-11 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 hover:text-purple-600 transition-colors"
            title={viewMode === 'detailed' ? "제목만 보기" : "상세히 보기"}
          >
            {viewMode === 'detailed' ? <Rows size={22} /> : <LayoutList size={22} />}
          </button>
          <button className="w-11 h-11 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">
            <Search size={22} />
          </button>
        </div>
      </header>

      <div className={`space-y-5 ${viewMode === 'compact' ? 'grid grid-cols-1 gap-3 space-y-0' : ''}`}>
        {CURATED_THEMES.map(theme => (
          <div
            key={theme.id}
            onClick={() => setSelectedTheme(theme)}
            className={`bg-white rounded-[32px] shadow-sm border border-gray-100 active:scale-[0.98] transition-all flex gap-5 cursor-pointer ${viewMode === 'detailed' ? 'p-6' : 'p-4 items-center'}`}
          >
            <div className={`${viewMode === 'detailed' ? 'text-4xl w-16 h-16' : 'text-2xl w-12 h-12'} bg-gray-50 rounded-[22px] flex items-center justify-center flex-shrink-0`}>
              {theme.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <h3 className={`font-bold text-gray-900 truncate ${viewMode === 'detailed' ? 'text-lg' : 'text-base'}`}>{theme.title}</h3>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{theme.level}</span>
              </div>

              {viewMode === 'detailed' && (
                <>
                  <div className="bg-gray-50 p-3 rounded-2xl mb-4 border border-gray-50">
                    <p className="text-xs text-gray-500 line-clamp-2 italic leading-relaxed">"{theme.description}"</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-purple-400" />
                      <span className="text-[10px] font-black text-purple-600 uppercase">{theme.count} 단어 수록</span>
                    </div>
                    <div className="text-purple-600 flex items-center gap-1 text-xs font-bold">
                      상세보기 <ChevronRight size={14} />
                    </div>
                  </div>
                </>
              )}

              {viewMode === 'compact' && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{theme.count} 단어 • {theme.category}</span>
                  <ChevronRight size={16} className="text-gray-200" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const ThemeDetailScreen = ({ theme }) => (
    <div className="flex flex-col bg-white min-h-full relative overflow-y-auto pb-32">
      <div className="h-80 flex-shrink-0 bg-gray-900 relative flex flex-col justify-end p-8 text-white">
        <button onClick={() => setSelectedTheme(null)} className="absolute top-8 left-6 w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 z-20">
          <ArrowLeft size={24} />
        </button>
        <div className="absolute inset-0 opacity-40 bg-purple-900 flex items-center justify-center text-[140px] select-none">
          {theme.icon}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent"></div>

        <div className="z-10">
          <div className="flex gap-2 mb-3">
            <span className="px-2 py-1 bg-purple-500 text-[10px] font-black rounded-lg uppercase tracking-wider">{theme.category}</span>
            <span className="px-2 py-1 bg-white/20 text-[10px] font-black rounded-lg uppercase tracking-wider backdrop-blur-md">LV. {theme.level}</span>
          </div>
          <h1 className="text-3xl font-bold mb-3">{theme.title}</h1>
          <p className="text-sm text-gray-300 leading-relaxed max-w-xs font-medium opacity-90">{theme.description}</p>
        </div>
      </div>

      <div className="flex-1 p-8 -mt-8 bg-white rounded-t-[48px] z-20 shadow-2xl space-y-8">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-50 pb-4">테마 학습 정보</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
            <p className="text-[10px] font-black text-gray-300 uppercase mb-2">Total Words</p>
            <p className="text-2xl font-bold text-gray-900">{theme.count}</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
            <p className="text-[10px] font-black text-gray-300 uppercase mb-2">Expertise</p>
            <p className="text-2xl font-bold text-purple-600 uppercase">{theme.level}</p>
          </div>
        </div>

        <div className="bg-purple-50 p-6 rounded-[32px] border border-purple-100">
          <h3 className="text-sm font-bold text-purple-900 mb-2 flex items-center gap-2">
            <Sparkles size={16} /> 학습 가이드
          </h3>
          <p className="text-xs text-purple-700 leading-relaxed font-medium">
            이 테마를 리스트에 등록하면 {theme.count}개의 실전 전문 어휘를 홈 화면에서 관리하고 학습할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="p-8 fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-50 max-w-md mx-auto z-50">
        <button
          onClick={() => handleAddFromCuration(theme)}
          className="w-full h-16 bg-purple-600 text-white rounded-[28px] font-bold shadow-2xl shadow-purple-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
        >
          <CheckCircle2 size={24} /> 이 테마 마스터하기
        </button>
      </div>
    </div>
  );

  const SettingsScreen = () => (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-10 tracking-tight">설정</h1>
      <div className="bg-white rounded-[32px] p-6 flex items-center gap-5 mb-10 shadow-sm border border-gray-100">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-3xl">👩‍💼</div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg leading-tight">사용자 님</h3>
          <p className="text-xs text-gray-400 font-bold uppercase mt-1">SokSok Voca User</p>
        </div>
      </div>
      <div className="space-y-3">
        {['학습 목표 알림', '데이터 백업/동기화', '서비스 이용약관', '로그아웃'].map((t, i) => (
          <div key={i} className="bg-white p-5 rounded-[22px] flex justify-between items-center shadow-sm border border-gray-50 active:bg-gray-50 cursor-pointer transition-colors">
            <span className={`text-sm font-bold ${i === 3 ? 'text-red-500' : 'text-gray-700'}`}>{t}</span>
            <ChevronRight size={18} className="text-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex justify-center bg-gray-200 min-h-screen font-sans">
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-[880px] my-auto rounded-[60px] overflow-hidden border-[12px] border-white shadow-purple-900/10">

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-gray-50">
          {selectedTheme ? (
            <ThemeDetailScreen theme={selectedTheme} />
          ) : (
            <>
              {activeTab === 'home' && <HomeScreen />}
              {activeTab === 'curation' && <CurationScreen />}
              {activeTab === 'settings' && <SettingsScreen />}
            </>
          )}
        </div>

        {/* Bottom Navigation Bar */}
        {!selectedTheme && (
          <nav className="absolute bottom-0 w-full bg-white/90 backdrop-blur-xl border-t border-gray-100 px-12 py-6 flex justify-between items-center z-[60] pb-8">
            <button
              onClick={() => { setActiveTab('home'); setIsImportMenuOpen(false); }}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'home' ? 'text-purple-600' : 'text-gray-300 hover:text-gray-400'}`}
            >
              <Home size={24} fill={activeTab === 'home' ? 'currentColor' : 'none'} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
              <span className="text-[10px] font-black uppercase tracking-tighter">Home</span>
            </button>
            <button
              onClick={() => { setActiveTab('curation'); setIsImportMenuOpen(false); }}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'curation' ? 'text-purple-600' : 'text-gray-300 hover:text-gray-400'}`}
            >
              <Library size={24} fill={activeTab === 'curation' ? 'currentColor' : 'none'} strokeWidth={activeTab === 'curation' ? 2.5 : 2} />
              <span className="text-[10px] font-black uppercase tracking-tighter">Curation</span>
            </button>
            <button
              onClick={() => { setActiveTab('settings'); setIsImportMenuOpen(false); }}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'settings' ? 'text-purple-600' : 'text-gray-300 hover:text-gray-400'}`}
            >
              <Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
              <span className="text-[10px] font-black uppercase tracking-tighter">Settings</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};

export default App;