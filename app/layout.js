import { Geist } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/app/components/ThemeProvider";
import { themeInitScript } from "@/lib/theme";
import { loadAccountTheme } from "@/lib/themeServer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Home",
  description: "Your household, organized.",
};

export default async function RootLayout({ children }) {
  const theme = await loadAccountTheme()

  return (
    <html
      lang="en"
      data-theme={theme.mode}
      className={`${geistSans.variable} h-full${theme.dark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full antialiased">
        <ThemeProvider initialTheme={theme.mode} userId={theme.userId}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
