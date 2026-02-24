'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Copy, Plus, Trash2, X, Check, ExternalLink, ArrowRight } from 'lucide-react';

const TIERS = ['챌린저', '그랜드마스터', '마스터', '다이아', '에메랄드', '플래티넘', '골드', '실버', '브론즈', '언랭'];
const POSITIONS = ['탑', '정글', '미드', '원딜', '서포터', '무관'];
const LS_KEY = 'league_auction_rooms';

interface BasicInfo {
  title: string;
  teamCount: number;
  membersPerTeam: number;
  totalPoints: number;
  orderPublic: boolean;
}

interface CaptainInfo {
  teamName: string;
  name: string;
  position: string;
  description: string;
  captainPoints: number;
}

interface PlayerInfo {
  name: string;
  tier: string;
  mainPosition: string;
  subPosition: string;
  description: string;
}

interface GeneratedLinks {
  roomId: string;
  organizerPath: string;
  organizerLink: string;
  captainLinks: { teamName: string; link: string }[];
  viewerLink: string;
}

interface StoredRoom {
  id: string;
  name: string;
  organizerPath: string;
  createdAt: string;
}

const STEPS = ['기본 정보', '팀장 등록', '선수 등록', '링크 발급'];

function saveRoomToStorage(room: StoredRoom) {
  try {
    const prev: StoredRoom[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const updated = [room, ...prev.filter(r => r.id !== room.id)].slice(0, 5);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  } catch { }
}

function removeRoomFromStorage(id: string) {
  try {
    const prev: StoredRoom[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    localStorage.setItem(LS_KEY, JSON.stringify(prev.filter(r => r.id !== id)));
  } catch { }
}

export function CreateRoomModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // 미완료 방 알림
  const [activeRooms, setActiveRooms] = useState<StoredRoom[]>([]);
  const [isCheckingRooms, setIsCheckingRooms] = useState(false);

  const [basic, setBasic] = useState<BasicInfo>({
    title: '',
    teamCount: 5,
    membersPerTeam: 5,
    totalPoints: 1000,
    orderPublic: true,
  });
  const [captains, setCaptains] = useState<CaptainInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [links, setLinks] = useState<GeneratedLinks | null>(null);

  // 모달 열릴 때 미완료 방 확인
  useEffect(() => {
    if (!isOpen) return;
    checkActiveRooms();
  }, [isOpen]);

  const checkActiveRooms = async () => {
    setIsCheckingRooms(true);
    try {
      const stored: StoredRoom[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      if (stored.length === 0) return;

      const active: StoredRoom[] = [];
      for (const room of stored) {
        // 플레이어 상태 조회 — SOLD가 아닌 선수가 있거나, 플레이어가 없는 방(세팅 직후)은 미완료로 간주
        const { data: roomCheck } = await supabase
          .from('rooms').select('id').eq('id', room.id).maybeSingle();
        if (!roomCheck) {
          removeRoomFromStorage(room.id);
          continue;
        }
        const { data: playerData } = await supabase
          .from('players').select('status').eq('room_id', room.id);
        const allSold = playerData && playerData.length > 0 && playerData.every(p => p.status === 'SOLD');
        if (!allSold) active.push(room);
      }
      setActiveRooms(active);
    } catch (err) {
      console.error('checkActiveRooms error:', err);
    } finally {
      setIsCheckingRooms(false);
    }
  };

  const syncCaptains = (count: number) => {
    setCaptains(prev => {
      const result: CaptainInfo[] = [];
      for (let i = 0; i < count; i++) {
        result.push(prev[i] ?? {
          teamName: `팀 ${i + 1}`,
          name: '',
          position: '탑',
          description: '',
          captainPoints: 0,
        });
      }
      return result;
    });
  };

  const syncPlayers = (count: number) => {
    setPlayers(prev => {
      if (prev.length >= count) return prev;
      const extra = Array.from({ length: count - prev.length }, () => ({
        name: '', tier: '골드', mainPosition: '탑', subPosition: '무관', description: '',
      }));
      return [...prev, ...extra];
    });
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!basic.title.trim()) { alert('경매 제목을 입력해주세요.'); return; }
      if (!basic.teamCount || basic.teamCount < 2) { alert('팀은 최소 2개 이상이어야 합니다.'); return; }
      if (!basic.membersPerTeam || basic.membersPerTeam < 2) { alert('팀당 인원은 최소 2명 이상이어야 합니다.'); return; }
      if (!basic.totalPoints || basic.totalPoints < 100) { alert('총 포인트는 최소 100 이상이어야 합니다.'); return; }
      syncCaptains(basic.teamCount);
      setStep(1);
    } else if (step === 1) {
      const invalid = captains.some(c => !c.name.trim() || !c.teamName.trim());
      if (invalid) { alert('모든 팀장의 팀 이름과 이름을 입력해주세요.'); return; }
      const overPoint = captains.some(c => c.captainPoints < 0 || c.captainPoints >= basic.totalPoints);
      if (overPoint) { alert('팀장 포인트는 0 이상, 총 포인트 미만이어야 합니다.'); return; }
      syncPlayers(basic.teamCount * (basic.membersPerTeam - 1));
      setStep(2);
    } else if (step === 2) {
      const minPlayers = basic.teamCount * (basic.membersPerTeam - 1);
      const invalidName = players.find(p => !p.name.trim());
      if (invalidName) { alert('모든 선수의 이름을 입력해주세요.'); return; }
      if (players.length < minPlayers) {
        const confirmed = confirm(
          `현재 ${players.length}명 등록됨.\n최소 추천 인원은 ${minPlayers}명 (${basic.teamCount}팀 × ${basic.membersPerTeam - 1}명)입니다.\n\n계속 진행하시겠습니까?`
        );
        if (!confirmed) return;
      }
      setIsLoading(true);
      try {
        await createRoom();
        setStep(3);
      } catch (err) {
        console.error(err);
        alert('방 생성에 실패했습니다. 콘솔을 확인해주세요.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const createRoom = async () => {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert([{
        name: basic.title,
        total_teams: basic.teamCount,
        base_point: basic.totalPoints,
        members_per_team: basic.membersPerTeam,
        order_public: basic.orderPublic,
      }])
      .select()
      .single();
    if (roomError) throw roomError;

    const teamsData = captains.map(c => ({
      room_id: room.id,
      name: c.teamName,
      point_balance: basic.totalPoints - c.captainPoints,
      leader_name: c.name,
      leader_position: c.position,
      leader_description: c.description,
      captain_points: c.captainPoints,
    }));
    const { data: teamsResult, error: teamsError } = await supabase
      .from('teams').insert(teamsData).select();
    if (teamsError) throw teamsError;

    if (players.length > 0) {
      const playersData = players.map(p => ({
        room_id: room.id,
        name: p.name,
        tier: p.tier,
        main_position: p.mainPosition,
        sub_position: p.subPosition,
        description: p.description,
      }));
      const { error: playersError } = await supabase.from('players').insert(playersData);
      if (playersError) throw playersError;
    }

    const baseUrl = window.location.origin;
    const organizerPath = `/room/${room.id}?role=ORGANIZER&token=${room.organizer_token}`;

    // localStorage에 저장
    saveRoomToStorage({ id: room.id, name: basic.title, organizerPath, createdAt: new Date().toISOString() });

    setLinks({
      roomId: room.id,
      organizerPath,
      organizerLink: `${baseUrl}${organizerPath}`,
      captainLinks: (teamsResult ?? []).map(team => ({
        teamName: team.name,
        link: `${baseUrl}/room/${room.id}?role=LEADER&teamId=${team.id}&token=${team.leader_token}`,
      })),
      viewerLink: `${baseUrl}/room/${room.id}?role=VIEWER&token=${room.viewer_token}`,
    });
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const addPlayer = () => {
    setPlayers(prev => [...prev, { name: '', tier: '골드', mainPosition: '탑', subPosition: '무관', description: '' }]);
  };

  const removePlayer = (i: number) => {
    setPlayers(prev => prev.filter((_, idx) => idx !== i));
  };

  const updatePlayer = (i: number, field: keyof PlayerInfo, value: string) => {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const updateCaptain = (i: number, field: keyof CaptainInfo, value: string | number) => {
    setCaptains(prev => prev.map((c, idx) => {
      if (idx !== i) return c;
      const updated = { ...c, [field]: value };
      if (field === 'name' && typeof value === 'string') {
        const defaultName = `팀 ${i + 1}`;
        const prevAutoName = `${c.name}팀`;
        if (!c.name || c.teamName === defaultName || c.teamName === prevAutoName) {
          updated.teamName = value ? `${value}팀` : defaultName;
        }
      }
      return updated;
    }));
  };

  const reset = () => {
    setStep(0);
    setBasic({ title: '', teamCount: 5, membersPerTeam: 5, totalPoints: 1000, orderPublic: true });
    setCaptains([]);
    setPlayers([]);
    setLinks(null);
    setCopied(null);
    setActiveRooms([]);
  };

  const close = () => { setIsOpen(false); reset(); };

  const goToRoom = (organizerPath: string) => {
    close();
    router.push(organizerPath);
  };

  const minPlayers = basic.teamCount * (basic.membersPerTeam - 1);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-minion-yellow hover:bg-minion-yellow-hover text-minion-blue font-bold py-4 px-10 rounded-2xl text-2xl transition-all shadow-[0_6px_0_#D9B310] hover:shadow-[0_4px_0_#D9B310] hover:translate-y-1 active:shadow-none hover:scale-105 active:scale-95"
      >
        새로운 경매방 만들기
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-black text-minion-blue">🍌 경매방 만들기</h2>
                <p className="text-xs text-gray-400 mt-0.5">{STEPS[step]} ({step + 1}/{STEPS.length})</p>
              </div>
              {step < 3 && (
                <button onClick={close} className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors">
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Step Indicator */}
            <div className="px-6 pt-4 pb-2 flex items-center shrink-0">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? '1' : 'initial' }}>
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors shrink-0 ${i < step ? 'bg-green-500 text-white' :
                      i === step ? 'bg-minion-blue text-white' :
                        'bg-gray-100 text-gray-400'
                    }`}>
                    {i < step ? <Check size={13} /> : i + 1}
                  </div>
                  <span className={`ml-1.5 text-xs font-medium whitespace-nowrap ${i === step ? 'text-minion-blue' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded-full ${i < step ? 'bg-green-400' : 'bg-gray-100'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">

              {/* Step 0: 기본 정보 */}
              {step === 0 && (
                <div className="space-y-5">

                  {/* 미완료 방 알림 배너 */}
                  {isCheckingRooms && (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 text-xs text-gray-400 text-center">
                      이전 경매방 확인 중...
                    </div>
                  )}
                  {!isCheckingRooms && activeRooms.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                      <p className="text-sm font-black text-orange-700 mb-3">
                        ⚠️ 진행 중인 경매방이 있습니다
                      </p>
                      <div className="space-y-2">
                        {activeRooms.map(room => (
                          <div
                            key={room.id}
                            className="bg-white border border-orange-200 rounded-xl p-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-gray-800 text-sm truncate">{room.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(room.createdAt).toLocaleDateString('ko-KR', {
                                  month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })} 생성
                              </p>
                            </div>
                            <button
                              onClick={() => goToRoom(room.organizerPath)}
                              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                            >
                              이 방으로 이동 <ArrowRight size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-orange-500 mt-2">
                        아래 양식을 작성하면 새 경매방을 만들 수 있습니다.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-1.5">경매 제목 *</label>
                    <input
                      type="text"
                      value={basic.title}
                      onChange={e => setBasic(p => ({ ...p, title: e.target.value }))}
                      placeholder="예: 롤 리그 시즌 1 선수 경매"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">팀 수</label>
                      <input
                        type="number" min={2} max={12}
                        value={basic.teamCount}
                        onChange={e => setBasic(p => ({ ...p, teamCount: e.target.value === '' ? '' as unknown as number : parseInt(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">팀당 인원 수</label>
                      <input
                        type="number" min={2} max={20}
                        value={basic.membersPerTeam}
                        onChange={e => setBasic(p => ({ ...p, membersPerTeam: e.target.value === '' ? '' as unknown as number : parseInt(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue"
                      />
                      <p className="text-xs text-gray-400 mt-1">팀장 포함</p>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">팀당 총 포인트</label>
                      <input
                        type="number" min={100} step={100}
                        value={basic.totalPoints}
                        onChange={e => setBasic(p => ({ ...p, totalPoints: e.target.value === '' ? '' as unknown as number : parseInt(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-1.5">경매 순서 공개</label>
                    <div className="flex gap-3">
                      {[
                        { value: true, label: '전체 공개' },
                        { value: false, label: '주최자만 공개' },
                      ].map(opt => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setBasic(p => ({ ...p, orderPublic: opt.value }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${basic.orderPublic === opt.value
                              ? 'border-minion-blue bg-minion-blue text-white'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {basic.orderPublic ? '모든 참가자가 경매 순서를 볼 수 있습니다.' : '주최자만 경매 순서를 볼 수 있습니다.'}
                    </p>
                  </div>

                  <div className="bg-blue-50 rounded-2xl p-4 text-sm text-gray-600 space-y-1">
                    <p className="font-bold text-minion-blue mb-1">요약</p>
                    <p>· 총 {basic.teamCount}팀, 팀당 {basic.membersPerTeam}명 (팀장 포함)</p>
                    <p>· 경매 선수 최소 <span className="font-bold text-red-500">{minPlayers}명</span> 필요</p>
                    <p>· 각 팀 시작 포인트: {basic.totalPoints}P (팀장 포인트 차감 전)</p>
                  </div>
                </div>
              )}

              {/* Step 1: 팀장 등록 */}
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-3">
                    팀장 이름을 입력하면 팀명이 자동으로 생성됩니다. 팀장 포인트는 시작 포인트에서 차감됩니다.
                  </p>
                  {captains.map((captain, i) => (
                    <div key={i} className="border border-gray-100 rounded-2xl p-4 bg-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 bg-minion-blue rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                        <input
                          type="text"
                          value={captain.teamName}
                          onChange={e => updateCaptain(i, 'teamName', e.target.value)}
                          placeholder="팀 이름"
                          className="font-bold text-minion-blue bg-transparent border-b-2 border-gray-200 focus:border-minion-blue outline-none px-1 py-0.5 text-sm flex-1 min-w-0"
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                          시작 포인트:{' '}
                          <span className={`font-bold ${basic.totalPoints - captain.captainPoints > 0 ? 'text-minion-blue' : 'text-red-500'}`}>
                            {basic.totalPoints - captain.captainPoints}P
                          </span>
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">팀장 이름 *</label>
                          <input
                            type="text"
                            value={captain.name}
                            onChange={e => updateCaptain(i, 'name', e.target.value)}
                            placeholder="이름"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">포지션</label>
                          <select
                            value={captain.position}
                            onChange={e => updateCaptain(i, 'position', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white"
                          >
                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">팀장 포인트</label>
                          <input
                            type="number" min={0} max={basic.totalPoints - 1}
                            value={captain.captainPoints}
                            onChange={e => updateCaptain(i, 'captainPoints', e.target.value === '' ? '' as unknown as number : parseInt(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">소개</label>
                          <input
                            type="text"
                            value={captain.description}
                            onChange={e => updateCaptain(i, 'description', e.target.value)}
                            placeholder="간단 소개"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 text-center pt-1">
                    팀 시작 포인트 = 총 포인트({basic.totalPoints}) - 팀장 포인트
                  </p>
                </div>
              )}

              {/* Step 2: 선수 등록 */}
              {step === 2 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-700">경매 선수 목록</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${players.length >= minPlayers
                          ? 'bg-green-100 text-green-600'
                          : 'bg-orange-100 text-orange-500'
                        }`}>
                        {players.length} / 최소 {minPlayers}명
                      </span>
                    </div>
                    <button
                      onClick={addPlayer}
                      className="flex items-center gap-1.5 bg-minion-blue hover:bg-minion-blue-hover text-white px-3 py-1.5 rounded-xl text-sm font-bold transition-colors"
                    >
                      <Plus size={14} /> 선수 추가
                    </button>
                  </div>

                  {players.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <p className="text-4xl mb-2">👤</p>
                      <p className="text-sm">위의 버튼으로 선수를 추가해주세요</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid gap-2 text-xs font-bold text-gray-400 px-2 pb-1" style={{ gridTemplateColumns: '1fr 5rem 5rem 5rem 1fr 2rem' }}>
                        <span>이름 *</span>
                        <span>티어</span>
                        <span>주 포지션</span>
                        <span>부 포지션</span>
                        <span>소개</span>
                        <span />
                      </div>
                      {players.map((player, i) => (
                        <div key={i} className="grid gap-2 items-center bg-gray-50 rounded-xl px-2 py-1.5" style={{ gridTemplateColumns: '1fr 5rem 5rem 5rem 1fr 2rem' }}>
                          <input
                            type="text"
                            value={player.name}
                            onChange={e => updatePlayer(i, 'name', e.target.value)}
                            placeholder="선수 이름"
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white w-full"
                          />
                          <select
                            value={player.tier}
                            onChange={e => updatePlayer(i, 'tier', e.target.value)}
                            className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white w-full"
                          >
                            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select
                            value={player.mainPosition}
                            onChange={e => updatePlayer(i, 'mainPosition', e.target.value)}
                            className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white w-full"
                          >
                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select
                            value={player.subPosition}
                            onChange={e => updatePlayer(i, 'subPosition', e.target.value)}
                            className="border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white w-full"
                          >
                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <input
                            type="text"
                            value={player.description}
                            onChange={e => updatePlayer(i, 'description', e.target.value)}
                            placeholder="소개 (선택)"
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-minion-blue bg-white w-full"
                          />
                          <button
                            onClick={() => removePlayer(i)}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: 링크 발급 */}
              {step === 3 && links && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                    <div className="text-3xl mb-1">🎉</div>
                    <p className="font-black text-green-700 text-lg">경매방이 생성되었습니다!</p>
                    <p className="text-sm text-green-600 mt-1">아래 링크를 각 참가자에게 공유하세요.</p>
                  </div>

                  <LinkCard
                    label="👑 주최자 링크"
                    desc="경매 진행 및 관리 전용"
                    link={links.organizerLink}
                    linkKey="organizer"
                    copied={copied}
                    onCopy={copyToClipboard}
                  />

                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-2">🛡️ 팀장 링크 (팀별 개별 공유)</p>
                    <div className="space-y-2">
                      {links.captainLinks.map((cl, i) => (
                        <LinkCard
                          key={i}
                          label={cl.teamName}
                          desc="팀장 전용 — 입찰 가능"
                          link={cl.link}
                          linkKey={`captain-${i}`}
                          copied={copied}
                          onCopy={copyToClipboard}
                        />
                      ))}
                    </div>
                  </div>

                  <LinkCard
                    label="👀 관전자 링크"
                    desc="관전 전용 — 입찰 불가, 자유롭게 공유 가능"
                    link={links.viewerLink}
                    linkKey="viewer"
                    copied={copied}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0">
              {step < 3 ? (
                <>
                  <button
                    onClick={step === 0 ? close : () => setStep(s => s - 1)}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    {step === 0 ? '취소' : '← 이전'}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={isLoading}
                    className="bg-minion-blue hover:bg-minion-blue-hover text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? '생성 중...' : step === 2 ? '방 만들기 🎉' : '다음 →'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={close}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    닫기
                  </button>
                  {links && (
                    <button
                      onClick={() => { router.push(links.organizerPath); close(); }}
                      className="bg-minion-yellow hover:bg-minion-yellow-hover text-minion-blue px-6 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 shadow-[0_4px_0_#D9B310] hover:shadow-[0_2px_0_#D9B310] hover:translate-y-0.5 active:shadow-none active:translate-y-1"
                    >
                      경매 시작하기 <ExternalLink size={14} />
                    </button>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

function LinkCard({
  label, desc, link, linkKey, copied, onCopy,
}: {
  label: string;
  desc: string;
  link: string;
  linkKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 flex items-center gap-3 bg-gray-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
        <p className="text-xs text-blue-500 truncate mt-0.5 font-mono">{link}</p>
      </div>
      <button
        onClick={() => onCopy(link, linkKey)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${copied === linkKey
            ? 'bg-green-100 text-green-700'
            : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-200'
          }`}
      >
        {copied === linkKey ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
      </button>
    </div>
  );
}
