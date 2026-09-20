'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);

  useEffect(() => {
    if (!supabase) return; // Admin dashboard is Supabase-only; local mode shows empty lists.
    async function fetchData() {
      const { data: profilesData } = await supabase!.from('profiles').select('*');
      const { data: reqsData } = await supabase!.from('pickup_requests').select('*, profiles(name)');
      if (profilesData) setProfiles(profilesData);
      if (reqsData) setReqs(reqsData);
    }
    fetchData();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Users</h2>
        <div className="bg-white p-4 rounded-lg shadow">
          {profiles.map(p => (
            <div key={p.id} className="border-b py-2">{p.name} - {p.role}</div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Requests</h2>
        <div className="bg-white p-4 rounded-lg shadow">
          {reqs.map(r => (
            <div key={r.id} className="border-b py-2">{r.waste_type} - {r.status}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
