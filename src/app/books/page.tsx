"use client";

import dynamic from "next/dynamic";

const BooksWorkspace = dynamic(() => import("./BooksWorkspace"), {
  ssr: false,
  loading: () => <main className="loading-screen">Opening Books…</main>,
});

export default function BooksPage() {
  return <BooksWorkspace />;
}
