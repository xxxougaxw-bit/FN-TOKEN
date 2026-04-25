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

    const newParticipants = [...t.participants, username];
    const { error } = await supabase.from('tournaments').update({ participants: newParticipants }).eq('id', t.id);
    if (!error) alert("参加登録が完了しました！");
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
      if (updated.host_report === updated.guest_report) return alert("報告が矛盾しています");
      const winnerName = (updated.host_report === 'win') ? updated.host : updated.guest_name;
      const { data: winnerProfile } = await supabase.from('profiles').select('*').eq('username', winnerName).single();
      if (winnerProfile) {
        await supabase.from('profiles').update({ points: winnerProfile.points + (updated.bet * 2), wins: (winnerProfile.wins || 0) + 1 }).eq('id', winnerProfile.id);
        await supabase.from('matches').update({ status: 'finished' }).eq('id', match.id);
      }
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <h1 className="text-7xl font-black italic text-blue-500 mb-8 tracking-tighter uppercase">FN TOKENS</h1>
      <button onClick={handleLogin} className="bg-white text-black font-black px-12 py-5 rounded-2xl hover:scale-105 transition-all italic text-xl uppercase tracking-widest">Login</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 font-sans">
      <nav className="flex justify-between items-center max-w-6xl mx-auto mb-10 border-b border-white/5 pb-6">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black italic text-blue-500 tracking-tighter uppercase leading-none">FN TOKENS</h1>
          <button onClick={() => setIsProfileModalOpen(true)} className="group flex items-center gap-2 mt-2 text-left">
            <span className="text-[10px] text-gray-500 font-bold uppercase block">{username}</span>
            <span className="text-[10px] text-blue-400 font-bold block">ID: {epicId}</span>
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs font-black italic">
          <div className="bg-[#111] px-4 py-2 rounded-xl border border-blue-600/30 text-blue-500">{wins} WINS</div>
          <div className="bg-[#111] px-5 py-2 rounded-xl border border-yellow-500/30 text-yellow-500">{points.toLocaleString()} PT</div>
          <button onClick={handleLogout} className="text-gray-700 hover:text-red-500 transition-colors ml-2 uppercase text-[10px]">Logout</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-4 order-2 lg:order-1">
          <h2 className="text-[10px] font-black italic uppercase text-yellow-500 tracking-[0.3em] ml-2">Whale Ranking</h2>
          <div className="bg-[#0d0d0d] border border-gray-800 rounded-[32px] overflow-hidden mb-8">
            {leaderboard.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-gray-600">#{index + 1}</span>
                  <span className="text-xs font-bold truncate max-w-[90px]">{player.username}</span>
                </div>
                <div className="text-[10px] font-mono font-bold text-yellow-500 italic">{player.points.toLocaleString()} PT</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4 pb-32 order-1 lg:order-2">
          {/* トーナメント */}
          <div className="mb-10">
            <h2 className="text-[10px] font-black italic uppercase text-blue-500 tracking-[0.3em] ml-2 mb-4 flex items-center gap-2">Major Tournaments</h2>
            <div className="grid gap-4">
              {tournaments.map((t) => (
                <div key={t.id} className="p-8 rounded-[40px] border border-blue-500/20 bg-[#0d0d0d] relative overflow-hidden group">
                  <div className="flex justify-between items-center relative z-10 text-left">
                    <div>
                      <h3 className="font-black text-4xl italic uppercase tracking-tighter mb-2">{t.title}</h3>
                      <div className="flex gap-4">
                        <span className="text-[10px] font-black text-gray-500 uppercase">Entries: {t.participants?.length || 0} / {t.max_players}</span>
                        <span className="text-[10px] font-black text-yellow-500 uppercase font-mono">Prize: {t.prize_pool?.toLocaleString()} PT</span>
                      </div>
                    </div>
                    <button onClick={() => handleJoinTournament(t)} className="bg-blue-600 text-white font-black px-10 py-4 rounded-2xl italic text-xs uppercase hover:bg-white hover:text-black transition-all">Join</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ロビー */}
          <h2 className="text-[10px] font-black italic uppercase text-gray-600 tracking-[0.3em] ml-2 flex items-center gap-2">Live Lobby</h2>
          <div className="grid gap-4">
            {matches.length > 0 ? matches.map((m) => {
              const isMyMatch = m.host === username || m.guest_name === username;
              const myReport = m.host === username ? m.host_report : m.guest_report;
              return (
                <div key={m.id} className={`p-8 rounded-[40px] border transition-all ${isMyMatch ? 'border-blue-500/50 bg-[#111]' : 'border-gray-800/50 bg-[#0d0d0d]'}`}>
                  <div className="flex justify-between items-center text-left">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[8px] font-black px-2 py-1 rounded-md bg-blue-600 uppercase">{m.status}</span>
                        <span className="text-gray-500 text-[10px] font-bold uppercase">Host: {m.host}</span>
                      </div>
                      <h3 className="font-black text-3xl italic uppercase tracking-tighter">{m.mode}</h3>
                      <p className="text-gray-600 text-xs mt-1 font-bold italic uppercase">{m.rule || "Wager Match"}</p>
                    </div>
                    <div className="text-right font-mono font-bold text-yellow-500 italic text-4xl">{m.bet?.toLocaleString()}</div>
                  </div>
                  {m.status === 'open' && m.host !== username && (
                    <button onClick={() => handleJoin(m)} className="mt-8 w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all text-sm italic uppercase">Accept</button>
                  )}
                  {m.status === 'closed' && isMyMatch && (
                    <div className="mt-8 flex gap-4">
                      <button disabled={!!myReport} onClick={() => reportResult(m, 'win')} className="flex-1 py-5 rounded-2xl bg-green-500 font-black italic text-sm uppercase">Win</button>
                      <button disabled={!!myReport} onClick={() => reportResult(m, 'loss')} className="flex-1 py-5 rounded-2xl bg-red-500 font-black italic text-sm uppercase">Loss</button>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="p-24 border border-dashed border-gray-800 rounded-[50px] text-center text-gray-800 font-black italic uppercase text-xs tracking-widest">No Active Match</div>
            )}
          </div>
        </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} className="fixed bottom-10 right-10 bg-blue-600 text-white font-black px-16 py-6 rounded-full shadow-2xl hover:bg-blue-500 transition-all uppercase italic text-sm z-50">+ Create Lobby</button>

      {/* モーダル類 */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 z-[110]">
          <div className="bg-[#0d0d0d] border border-gray-800 p-10 rounded-[50px] w-full max-w-sm">
            <h2 className="text-3xl font-black mb-8 italic text-blue-500 uppercase tracking-tighter">Identity</h2>
            <div className="space-y-6 text-left">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold" placeholder="Name" />
              <input type="text" value={editEpic} onChange={(e) => setEditEpic(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white outline-none font-bold" placeholder="Epic ID" />
              <div className="flex gap-4">
                <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 text-gray-600 font-black py-5 uppercase text-[10px]">Cancel</button>
                <button onClick={async () => {
                  await supabase.from('profiles').update({ username: editName, epic_id: editEpic || "未設定" }).eq('id', user.id);
                  setIsProfileModalOpen(false);
                  fetchInitialData(user);
                }} className="flex-1 bg-blue-600 text-white font-black py-5 rounded-2xl uppercase text-[10px]">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0d0d0d] border border-gray-800 p-10 rounded-[50px] w-full max-w-md">
            <h2 className="text-4xl font-black mb-10 italic text-blue-500 uppercase tracking-tighter text-left">Lobby Setup</h2>
            <div className="space-y-6">
              <input type="text" value={newMode} onChange={(e) => setNewMode(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white font-bold" />
              <input type="text" placeholder="Rules" value={newRule} onChange={(e) => setNewRule(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 text-white font-bold" />
              <input type="text" value={newBet} onChange={(e) => setNewBet(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-[#1a1a1a] border border-gray-800 rounded-2xl p-6 text-yellow-500 font-mono font-bold text-5xl outline-none" />
              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 text-gray-600 font-black py-5 uppercase text-[10px]">Cancel</button>
                <button onClick={handlePost} className="flex-1 bg-blue-600 text-white font-black py-5 rounded-2xl uppercase text-[10px]">Deploy</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}