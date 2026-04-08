import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FuelDibe — Live Fuel Finder BD",
  description: "Community-powered live fuel pump tracker for Bangladesh. Find nearby active pumps, check fuel availability, and report live updates.",
  keywords: ["fuel pump", "petrol", "octane", "diesel", "Bangladesh", "Dhaka", "live fuel tracker"],
  openGraph: {
    title: "FuelDibe — Live Fuel Finder BD",
    description: "Find nearby active fuel pumps in real time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
