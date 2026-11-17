"use client";
import { useState } from "react";
import Image from "next/image";
import { CandidateAvatar } from "@/components/ui/primitives";
export function AccountAvatar({ name, photoURL, size = "sm" }: { name: string; photoURL?: string | null; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState<string | null>(null);
  const pixels = size === "sm" ? 32 : 40;
  return photoURL && failed !== photoURL ? <Image unoptimized src={photoURL} alt="" width={pixels} height={pixels} referrerPolicy="no-referrer" onError={() => setFailed(photoURL)} className="shrink-0 rounded-full object-cover" style={{ width: pixels, height: pixels }} /> : <CandidateAvatar name={name || "?"} size={size} />;
}
