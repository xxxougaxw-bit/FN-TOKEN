"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [activeTab, setActiveTab] = useState<'lobby' | 'tournament'>('lobby');
  
  const [points, setPoints] = useState(0);
  const [wins, setWins] = useState(0);
  const [epicId, setEpicId] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEpic, setEditEpic] = useState("");

  const [newMode, setNewMode] = useState("2v2 Zonewars");
  const [newRule, setNewRule] = useState("");
  const [newBet, setNewBet] = useState<string>("500");

  const fetchData = async () => {
    fetchMatches();
    fetchLeaderboard();
    fetchTournaments();
  };

  const fetchMatches = async () => {
    const { data } = await supabase.from('matches').select('*').neq('status', 'finished').order('id', { ascending: false });
    if (data) setMatches(data);
  };

  const fetchLeaderboard = async () => {
    const { data } = await supabase.from('profiles').select('username, points').order('points', { ascending: false }).limit(5);
    if (data) setLeaderboard(data);
  };

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').neq('status', 'finished').order('id', { ascending: false });
    if (data) setTournaments(data);
  };

  const fetchInitialData = async (authUser: any) => {
    let { data: pData, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
    if (error || !pData) {
      const googleName = authUser.user_metadata?.full_name || "New Player";
      const { data: newData } = await supabase
        .from('profiles')
        .insert([{ id: authUser.id, username: googleName, points: 1000, epic_id: "未設定", wins: 0 }])
        .select().single();
      if (newData) updateStates(newData);
    } else {
      updateStates(pData);
    }
    fetchData();
  };

  const updateStates = (data: any) => {
    setPoints(data.points);
    setUsername(data.username);
    setEpicId(data.epic_id || "未設定");
    setWins(data.wins || 0);
    setEditName(data.username);
    setEditEpic(data.epic_id === "未設定" ? "" : data.epic_id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchInitialData(session.user);
      } else {
        setUser(null);
      }
    });

    const channel = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchLeaderboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => fetchTournaments())
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const handleJoinTournament = async (t: any) => {
    if (t.participants.includes(username)) return alert("既に参加しています");
    if (t.participants.length >= t.max_players) return alert("満員です");
    await supabase.from('tournaments').update({ participants: [...t.participants, username] }).eq('id', t.id);
    alert("参加登録完了！");
  };

  const handlePost = async () => {
    const bet = Number(newBet);
    if (points < bet) return alert("PT不足");
    await supabase.from('matches').insert([{ host: username, mode: newMode, rule: newRule, bet, status: 'open' }]);
    await supabase.from('profiles').update({ points: points - bet }).eq('id', user.id);
    setIsModalOpen(false);
  };

  const handleJoin = async (match: any) => {
    if (points < match.bet) return alert("PT不足");
    await supabase.from('profiles').update({ points: points - match.bet }).eq('id', user.id);
    await supabase.from('matches').update({ status: 'closed', guest_name: username }).eq('id', match.id);
  };

  const reportResult = async (match: any, result: 'win' | 'loss') => {
    const updateData = match.host === username ? { host_report: result } : { guest_report: result };
    const { data: updated } = await supabase.from('matches').update(updateData).eq('id', match.id).select().single();
    if (updated.host_report && updated.guest_report) {
      if (updated.host_report === updated.guest_report) return alert("矛盾しています");
      const winnerName = (updated.host_report === 'win') ? updated.host : updated.guest_name;
      const { data: winP } = await supabase.from('profiles').select('*').eq('username', winnerName).single();
      if (winP) {
        await supabase.from('profiles').update({ points: winP.points + (updated.bet * 2), wins: (winP.wins || 0) + 1 }).eq('id', winP.id);
        await supabase.from('matches').update({ status: 'finished' }).eq('id', match.id);
      }
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <h1 className="text-8xl font-black italic text-yellow-400 mb-8 tracking-tighter uppercase">FN TOKENS</h1>
      <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })} className="bg-yellow-400 text-black font-black px-14 py-6 rounded-2xl hover:scale-105 transition-all italic text-xl uppercase">Login</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white p-4 font-sans selection:bg-yellow-400/30">
      {/* HEADER */}
      <nav className="flex justify-between items-center max-w-6xl mx-auto mb-10 border-b border-white/5 pb-8">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black italic text-yellow-400 tracking-tighter uppercase leading-none">FN TOKENS</h1>
          <button onClick={() => setIsProfileModalOpen(true)} className="flex items-center gap-2 mt-3 group">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest group-hover:text-yellow-400 transition-colors">{username}</span>
            <span className="text-[8px] bg-yellow-400/10 px-2 py-0.5 rounded text-yellow-600 font-mono">ID: {epicId}</span>
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs font-black italic">
          <div className="bg-[#0a0a0a] px-5 py-3 rounded-xl border border-white/10 text-gray-400 tracking-widest">{wins} WINS</div>
          <div className="bg-[#0a0a0a] px-6 py-3 rounded-xl border border-yellow-400/20 text-yellow-400 font-mono text-lg">{points.toLocaleString()} PT</div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto">
        {/* TAB SYSTEM */}
        <div className="flex gap-2 mb-12 bg-[#0a0a0a] p-2 rounded-[28px] w-fit border border-white/5 mx-auto lg:mx-0 shadow-2xl">
          <button 
            onClick={() => setActiveTab('lobby')}
            className={`px-12 py-4 rounded-[22px] text-xs font-black uppercase italic transition-all ${activeTab === 'lobby' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-gray-500 hover:text-white'}`}
          >
            Lobby
          </button>
          <button 
            onClick={() => setActiveTab('tournament')}
            className={`px-12 py-4 rounded-[22px] text-xs font-black uppercase italic transition-all ${activeTab === 'tournament' ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'text-gray-500 hover:text-white'}`}
          >
            Tournaments
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          {/* SIDEBAR: RANKING */}
          <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">
            <h2 className="text-[10px] font-black italic uppercase text-gray-500 tracking-[0.4em] ml-2">Top Performance</h2>
            <div className="bg-[#050505] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
              {leaderboard.map((player, index) => (
                <div key={index} className={`flex items-center justify-between p-6 border-b border-white/5 last:border-0 ${index === 0 ? 'bg-yellow-400/[0.03]' : ''}`}>
                  <span className={`text-xs font-black ${index === 0 ? 'text-yellow-400' : 'text-gray-700'}`}>0{index + 1}</span>
                  <span className={`text-sm font-bold truncate max-w-[100px] ${index === 0 ? 'text-white' : 'text-gray-400'}`}>{player.username}</span>
                  <span className="text-xs font-mono font-bold text-yellow-400">{player.points.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="lg:col-span-3 pb-32 order-1 lg:order-2">
            {activeTab === 'lobby' ? (
              <div className="space-y-6">
                <h2 className="text-[10px] font-black italic uppercase text-yellow-400 tracking-[0.4em] ml-2 flex items-center gap-3">
                  <span className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse"></span> Active Sessions
                </h2>
                <div className="grid gap-6">
                  {matches.length > 0 ? matches.map((m) => {
                    const isMyMatch = m.host === username || m.guest_name === username;
                    const myReport = m.host === username ? m.host_report : m.guest_report;
                    return (
                      <div key={m.id} className={`p-10 rounded-[48px] border transition-all ${isMyMatch ? 'border-yellow-400 bg-[#0a0a0a]' : 'border-white/5 bg-[#050505]'}`}>
                        <div className="flex justify-between items-center">
                          <div className="text-left">
                            <span className="text-[8px] font-black px-3 py-1 rounded-full bg-yellow-400 text-black uppercase mb-3 inline-block tracking-widest">{m.status}</span>
                            <h3 className="font-black text-5xl italic uppercase tracking-tighter leading-none">{m.mode}</h3>
                            <p className="text-gray-500 text-[10px] font-bold uppercase mt-3 tracking-widest">{m.host} {m.rule && `| ${m.rule}`}</p>
                          </div>
                          <div className="text-right font-mono font-bold text-yellow-400 italic text-6xl tracking-tighter">{m.bet?.toLocaleString()}</div>
                        </div>
                        {m.status === 'open' && m.host !== username && (
                          <button onClick={() => handleJoin(m)} className="mt-10 w-full bg-white text-black font-black py-5 rounded-3xl hover:bg-yellow-400 transition-all text-sm italic uppercase tracking-widest shadow-xl shadow-white/5">Accept Challenge</button>
                        )}
                        {m.status === 'closed' && isMyMatch && (
                          <div className="mt-10 flex gap-4">
                            <button disabled={!!myReport} onClick={() => reportResult(m, 'win')} className={`flex-1 py-6 rounded-3xl font-black italic text-sm uppercase transition-all ${myReport === 'win' ? 'bg-yellow-400 text-black' : 'border border-yellow-400/20 text-yellow-400'}`}>Victory</button>
                            <button disabled={!!myReport} onClick={() => reportResult(m, 'loss')} className={`flex-1 py-6 rounded-3xl font-black italic text-sm uppercase transition-all ${myReport === 'loss' ? 'bg-white text-black' : 'border border-white/10 text-white/40'}`}>Defeat</button>
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="p-32 border-2 border-dashed border-white/5 rounded-[60px] text-center text-gray-800 font-black italic uppercase text-sm tracking-[0.5em]">Waiting for Challengers</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <h2 className="text-[10px] font-black italic uppercase text-yellow-400 tracking-[0.4em] ml-2">Major Events</h2>
                <div className="grid gap-8">
                  {tournaments.length > 0 ? tournaments.map((t) => (
                    <div key={t.id} className="p-12 rounded-[56px] border border-white/5 bg-[#050505] relative overflow-hidden group">
                      <div className="flex justify-between items-center relative z-10 text-left">
                        <div>
                          <h3 className="font-black text-6xl italic uppercase tracking-tighter mb-4 leading-none group-hover:text-yellow-400 transition-colors">{t.title}</h3>
                          <div className="flex gap-8">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Slots: {t.participants?.length || 0} / {t.max_players}</span>
                            <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest font-mono italic">Prize: {t.prize_pool?.toLocaleString()} PT</span>
                          </div>
                        </div>
                        <button onClick={() => handleJoinTournament(t)} className="bg-yellow-400 text-black font-black px-14 py-5 rounded-[28px] italic text-xs uppercase hover:bg-white transition-all shadow-2xl shadow-yellow-400/10 tracking-[0.2em]">Register</button>
                      </div>
                      <div className="absolute -right-12 -bottom-12 text-[16rem] font-black italic text-white/[0.02] pointer-events-none select-none uppercase tracking-tighter">GOLD</div>
                    </div>
                  )) : (
                    <div className="p-32 border-2 border-dashed border-white/5 rounded-[60px] text-center text-gray-800 font-black italic uppercase text-sm tracking-[0.5em]">No Active Cups</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FAB: イエローに統一 */}
      <button onClick={() => setIsModalOpen(true)} className="fixed bottom-12 right-12 bg-yellow-400 text-black font-black px-16 py-7 rounded-full shadow-2xl shadow-yellow-400/20 hover:scale-105 transition-all uppercase italic text-sm z-50 tracking-[0.3em]">Deploy Session</button>

      {/* MODALS: デザイン調整 */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl flex items-center justify-center p-6 z-[110]">
          <div className="bg-[#050505] border border-white/10 p-12 rounded-[60px] w-full max-w-sm shadow-2xl">
            <h2 className="text-4xl font-black mb-10 italic text-yellow-400 uppercase tracking-tighter">Profile</h2>
            <div className="space-y-8 text-left">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 text-white font-bold outline-none focus:border-yellow-400" placeholder="Display Name" />
              <input type="text" value={editEpic} onChange={(e) => setEditEpic(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 text-white font-bold outline-none focus:border-yellow-400" placeholder="Epic ID" />
              <div className="flex gap-6">
                <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 text-gray-600 font-black py-6 uppercase text-[10px] tracking-widest">Back</button>
                <button onClick={async () => {
                  await supabase.from('profiles').update({ username: editName, epic_id: editEpic || "未設定" }).eq('id', user.id);
                  setIsProfileModalOpen(false);
                  fetchInitialData(user);
                }} className="flex-1 bg-yellow-400 text-black font-black py-6 rounded-[28px] uppercase text-[10px] tracking-widest shadow-lg shadow-yellow-400/20">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#050505] border border-white/10 p-12 rounded-[60px] w-full max-w-md shadow-2xl">
            <h2 className="text-5xl font-black mb-12 italic text-yellow-400 uppercase tracking-tighter text-left leading-none">Setup Lobby</h2>
            <div className="space-y-8 text-left">
              <input type="text" placeholder="Mode" value={newMode} onChange={(e) => setNewMode(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 text-white font-bold focus:border-yellow-400 outline-none" />
              <input type="text" placeholder="Rules" value={newRule} onChange={(e) => setNewRule(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 text-white font-bold focus:border-yellow-400 outline-none" />
              <div className="relative">
                <input type="text" value={newBet} onChange={(e) => setNewBet(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 text-yellow-400 font-mono font-bold text-6xl outline-none" />
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-yellow-400/10 font-black italic text-3xl">PT</span>
              </div>
              <div className="flex gap-6 pt-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 text-gray-600 font-black py-6 uppercase text-[10px] tracking-widest">Cancel</button>
                <button onClick={handlePost} className="flex-1 bg-yellow-400 text-black font-black py-6 rounded-[28px] uppercase text-[10px] tracking-widest shadow-xl shadow-yellow-400/20">Launch</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}