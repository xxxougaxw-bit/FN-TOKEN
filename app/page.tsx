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
  const [epicId, setEpicId] = useState("");
  const [wins, setWins] = useState(0);
  const [points, setPoints] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]); // ポイントランキング用
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  const [editName, setEditName] = useState("");
  const [editEpic, setEditEpic] = useState("");
  const [newMode, setNewMode] = useState("2v2 Zonewars");
  const [newRule, setNewRule] = useState("");
  const [newBet, setNewBet] = useState<string>("500");

  const fetchMatches = async () => {
    const { data } = await supabase.from('matches').select('*').neq('status', 'finished').order('id', { ascending: false });
    if (data) setMatches(data);
  };

  // ポイントランキング取得（pointsの多い順に5人）
  const fetchLeaderboard = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('username, points')
      .order('points', { ascending: false })
      .limit(5);
    if (data) setLeaderboard(data);
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
    fetchMatches();
    fetchLeaderboard();
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

    // profilesテーブルの変更をリアルタイムで監視してランキングを更新
    const channel = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => fetchLeaderboard())
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdateProfile = async () => {
    if (!editName.trim()) return alert("名前を入力してください");
    const { error } = await supabase.from('profiles').update({ username: editName, epic_id: editEpic || "未設定" }).eq('id', user.id);
    if (!error) {
      setIsProfileModalOpen(false);
      fetchInitialData(user);
    }
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  };

  const handlePost = async () => {
    const bet = Number(newBet);
    if (points < bet) return alert("PT不足");
    await supabase.from('matches').insert([{ host: username, mode: newMode, rule: newRule, bet, status: 'open' }]);
    await supabase.from('profiles').update({ points: points - bet }).eq('id', user.id);
    setIsModalOpen(false);
    fetchInitialData(user);
  };

  const handleJoin = async (match: any) => {
    if (points < match.bet) return alert("PT不足");
    await supabase.from('profiles').update({ points: points - match.bet }).eq('id', user.id);
    await supabase.from('matches').update({ status: 'closed', guest_name: username }).eq('id', match.id);
    fetchInitialData(user);
  };

  const reportResult = async (match: any, result: 'win' | 'loss') => {
    const isHost = match.host === username;
    const updateData = isHost ? { host_report: result } : { guest_report: result };
    const { data: updated } = await supabase.from('matches').update(updateData).eq('id', match.id).select().single();
    
    if (updated.host_report && updated.guest_report) {
      if (updated.host_report === updated.guest_report) return alert("矛盾しています");
      const winnerName = (updated.host_report === 'win') ? updated.host : updated.guest_name;
      const { data: winnerProfile } = await supabase.from('profiles').select('*').eq('username', winnerName).single();
      if (winnerProfile) {
        await supabase.from('profiles').update({ points: winnerProfile.points + (updated.bet * 2), wins: (winnerProfile.wins || 0) + 1 }).eq('id', winnerProfile.id);
        await supabase.from('matches').update({ status: 'finished' }).eq('id', match.id);
        fetchInitialData(user);
      }
    } else {
      fetchMatches();
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <h1 className="text-7xl font-black italic text-blue-500 mb-8 tracking-tighter uppercase">FN TOKENS</h1>
      <button onClick={handleLogin} className="bg-white text-black font-black px-12 py-5 rounded-2xl hover:scale-105 transition-all italic text-xl uppercase">Login</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 font-sans selection:bg-blue-500/30">
      <nav className="flex justify-between items-center max-w-6xl mx-auto mb-10 border-b border-white/5 pb-6">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black italic text-blue-500 tracking-tighter uppercase leading-none">FN TOKENS</h1>
          <button onClick={() => setIsProfileModalOpen(true)} className="group flex items-center gap-2 mt-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{username} / <span className="text-blue-400">ID: {epicId}</span></span>
            <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all uppercase font-black">Edit</span>
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs font-black italic">
          <div className="bg-[#111] px-4 py-2 rounded-xl border border-blue-600/30 text-blue-500">{wins} WINS</div>
          <div className="bg-[#111] px-5 py-2 rounded-xl border border-yellow-500/30 text-yellow-500">{points.toLocaleString()} PT</div>
          <button onClick={handleLogout} className="text-gray-700 hover:text-red-500 transition-colors ml-2 uppercase">Out</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ポイントランキングセクション */}
        <div className="lg:col-span-1 space-y-4 order-2 lg:order-1">
          <h2 className="text-[10px] font-black italic uppercase text-yellow-500 tracking-[0.3em] ml-2">Whale Ranking</h2>
          <div className="bg-[#0d0d0d] border border-gray-800 rounded-[32px] overflow-hidden">
            {leaderboard.map((player, index) => (
              <div key={index} className={`flex items-center justify-between p-5 border-b border-white/5 last:border-0 ${index === 0 ? 'bg-yellow-500/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black ${index === 0 ? 'text-yellow-500' : 'text-gray-600'}`}>#{index + 1}</span>
                  <span className={`text-xs font-bold truncate max-w-[90px] ${index === 0 ? 'text-white' : 'text-gray-400'}`}>{player.username}</span>
                </div>
                <div className="text-[10px] font-mono font-bold text-yellow-500 italic">
                  {player.points.toLocaleString()} <span className="text-[8px]">PT</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ロビーセクション */}
        <div className="lg:col-span-3 space-y-4 pb-32 order-1 lg:order-2">
          <h2 className="text-[10px] font-black italic uppercase text-gray-600 tracking-[0.3em] ml-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Active Lobby
          </h2>
          <div className="grid gap-4">
            {matches.length > 0 ? matches.map((m) => {
              const isMyMatch = m.host === username || m.guest_name === username;
              const myReport = m.host === username ? m.host_report : m.guest_report;
              return (
                <div key={m.id} className={`p-8 rounded-[40px] border transition-all ${isMyMatch ? 'border-blue-500/50 bg-[#111]' : 'border-gray-800/50 bg-[#0d0d0d]'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${m.status === 'open' ? 'bg-blue-600' : 'bg-gray-800 text-gray-500'}`}>{m.status}</span>
                        <span className="text-gray-500 text-[10px] font-bold uppercase">Host: {m.host}</span>
                      </div>
                      <h3 className="font-black text-3xl italic uppercase tracking-tighter">{m.mode}</h3>
                      <p className="text-gray-600 text-xs mt-1 font-bold italic uppercase">{m.rule || "Wager"}</p>
                    </div>
                    <div className="text-right font-mono font-bold text-yellow-500 italic text-4xl">{m.bet}</div>
                  </div>
                  {m.status === 'open' && m.host !== username && (
                    <button onClick={() => handleJoin(m)} className="mt-8 w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all text-sm italic uppercase tracking-[0.2em]">Accept</button>
                  )}
                  {m.status === 'closed' && isMyMatch && (
                    <div className="mt-8 flex gap-4">
                      <button disabled={!!myReport} onClick={() => reportResult(m, 'win')} className={`flex-1 py-5 rounded-2xl font-black italic text-sm uppercase transition-all ${myReport === 'win' ? 'bg-green-500 text-white shadow-lg' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>I Won</button>
                      <button disabled={!!myReport} onClick={() => reportResult(m, 'loss')} className={`flex-1 py-5 rounded-2xl font-black italic text-sm uppercase transition-all ${myReport === 'loss' ? 'bg-red-500 text-white shadow-lg' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>I Lost</button>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="p-24 border border-dashed border-gray-800 rounded-[50px] text-center text-gray-800 font-black italic uppercase text-xs tracking-[0.4em]">Empty Lobby</div>
            )}
          </div>
        </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} className="fixed bottom-10 right-10 bg-blue-600 text-white font-black px-16 py-6 rounded-full shadow-2xl hover:bg-blue-500 hover:-translate-y-1 transition-all uppercase italic text-sm z-50">+ Post Match</button>

      {/* プロフィール編集 */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 z-[110]">
          <div className="bg-[#0d0d0d] border border-gray-800 p-10 rounded-[50px] w-full max-w-sm">
            <h2 className="text-3xl font-black mb-8 italic text-blue-500 uppercase tracking-tighter">Identity</h2>
            <div className="space-y-6">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold focus:border-blue-500" />
              <input type="text" value={editEpic} onChange={(e) => setEditEpic(e.target.value)} placeholder="Epic ID" className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold focus:border-blue-500" />
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 text-gray-600 font-black py-5 uppercase text-[10px]">Close</button>
                <button onClick={handleUpdateProfile} className="flex-1 bg-blue-600 text-white font-black py-5 rounded-2xl uppercase text-[10px]">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* マッチ作成 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0d0d0d] border border-gray-800 p-10 rounded-[50px] w-full max-w-md shadow-2xl">
            <h2 className="text-4xl font-black mb-10 italic text-blue-500 uppercase tracking-tighter">New Match</h2>
            <div className="space-y-6">
              <input type="text" placeholder="Mode" value={newMode} onChange={(e) => setNewMode(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold" />
              <input type="text" placeholder="Rules" value={newRule} onChange={(e) => setNewRule(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold" />
              <input type="text" value={newBet} onChange={(e) => setNewBet(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-yellow-500 font-mono font-bold text-4xl outline-none" />
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 text-gray-600 font-black py-5 uppercase text-[10px]">Cancel</button>
                <button onClick={handlePost} className="flex-1 bg-blue-600 text-white font-black py-5 rounded-2xl uppercase text-[10px]">Post</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}