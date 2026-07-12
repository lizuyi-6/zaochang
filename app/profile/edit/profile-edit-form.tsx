"use client";

import { ArrowLeft, Check, Link2, MapPin, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

export function ProfileEditForm({ initial }: { initial: { displayName: string; bio: string; location: string; website: string } }) {
  const [bio, setBio] = useState(initial.bio);
  const [location, setLocation] = useState(initial.location);
  const [website, setWebsite] = useState(initial.website);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_profile", bio, location, website }) });
    setSaving(false);
    setNotice(response.ok ? "个人资料已经保存" : "资料格式有误，请检查主页链接");
  };
  return <div className="profile-edit-page"><header><Link href="/profile"><ArrowLeft size={16} /> 返回个人主页</Link><div><span>PROFILE SETTINGS</span><h1>编辑个人资料</h1><p>名称由当前登录账户提供；简介、位置和主页链接会保存在造场账户中。</p></div></header><form onSubmit={submit}><div className="profile-edit-identity"><span>{initial.displayName[0]}</span><div><UserRound size={16} /><strong>{initial.displayName}</strong><small>账户名称不可在这里修改</small></div></div><label><span>个人简介 <b>{bio.length}/180</b></span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={180} minLength={4} /></label><div className="profile-edit-row"><label><span><MapPin size={14} /> 所在地</span><input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={40} /></label><label><span><Link2 size={14} /> 个人主页</span><input value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={120} placeholder="https://" /></label></div><footer><Link href="/profile">取消</Link><button className="primary-action" disabled={saving || bio.trim().length < 4 || !location.trim()}><Save size={16} /> {saving ? "保存中" : "保存资料"}</button></footer></form>{notice && <button className="action-toast" onClick={() => setNotice("")}><Check size={15} />{notice}</button>}</div>;
}
