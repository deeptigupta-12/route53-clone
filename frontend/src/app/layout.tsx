import type { Metadata } from "next";
import "@cloudscape-design/global-styles/index.css";

export const metadata: Metadata = {
  title: "Route 53 Console",
  description: "A clone of the AWS Route 53 console",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Visual refresh theme (the current AWS console look), set before the first render. */}
      <body className="awsui-visual-refresh" style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
