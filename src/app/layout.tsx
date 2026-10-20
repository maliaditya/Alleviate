import type { Metadata } from "next";
import "./globals.css";
import { AppDialogsProvider } from "./AppDialogs";

export const metadata: Metadata = {
  title: "Alleviate",
  description: "A calm workspace for ideas and focused work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Excalidraw appends `/dist/excalidraw-assets/` to this base itself.
            __html: "window.EXCALIDRAW_ASSET_PATH='/vendor/excalidraw/';",
          }}
        />
      </head>
      <body><AppDialogsProvider>{children}</AppDialogsProvider></body>
    </html>
  );
}
