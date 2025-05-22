'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation'; // Import usePathname
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
// Tabs and TabsList might not be needed if we switch to Links directly for main nav
import { BellIcon, SearchIcon } from "lucide-react";
import React, { JSX } from "react";
import { PrivyWalletButton } from './PrivyWalletButton';

export default function Header(): JSX.Element {
    const pathname = usePathname(); // Get current path

    // Navigation data with href
    const mainNavItems = [
        { id: "home", label: "Home", href: "/overview" }, // Changed href to /overview
        { id: "trade", label: "Trade", href: "/trade" }, // Assuming /trade is the route for Trade
    ];

    // SubNav items for the /overview page (or related pages)
    const subNavItems = [
        { id: "overview", label: "Overview", href: "/overview" },
        { id: "clients", label: "Clients", href: "/clients" }, // Assuming /clients is a sub-page of overview conceptually
    ];

    const notificationCount = 5;
    const showSubNav = pathname.startsWith('/overview') || pathname.startsWith('/clients'); // Condition to show sub-navigation

    return (
        <header className="flex flex-col items-center w-full bg-white shadow-sm">
            {/* Main navigation */}
            <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between px-[32px]">
                <div className="flex items-center gap-x-8">
                    <nav className="flex items-center gap-1">
                        {mainNavItems.map((item) => (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={`px-3 py-2 rounded-md h-auto font-medium text-gray-700 
                                            ${pathname === item.href 
                                                ? 'bg-gray-50 shadow-sm text-gray-900' 
                                                : 'hover:bg-gray-100'}`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="p-2.5 rounded-md relative text-gray-600 hover:bg-gray-100">
                        <BellIcon className="w-5 h-5" />
                        {notificationCount > 0 && (
                            <span className="absolute top-1 right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                            </span>
                        )}
                    </Button>
                    <PrivyWalletButton /> 
                </div>
            </div>

            <Separator className="w-full bg-gray-200" />

            {/* Conditional Sub navigation */}
            {showSubNav && (
                <div className="flex w-full max-w-[1280px] h-16 items-center justify-between px-[32px]">
                    <nav className="flex items-center gap-1">
                        {subNavItems.map((item) => (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={`px-3 py-2 rounded-md h-auto font-medium 
                                            ${pathname === item.href 
                                                ? 'bg-gray-50 text-gray-900' 
                                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="w-80">
                        <div className="relative">
                            <Input
                                className="pl-10 pr-3 py-2.5 h-11 bg-white rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                placeholder="Search..."
                            />
                            <SearchIcon className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}