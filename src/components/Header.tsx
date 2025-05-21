'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BellIcon, SearchIcon } from "lucide-react"; // WalletIcon is part of PrivyWalletButton
import React, { JSX } from "react";
import { PrivyWalletButton } from './PrivyWalletButton'; // Import PrivyWalletButton

export default function Header(): JSX.Element { // Renamed to Header to match filename
    // Navigation data for reusability
    const mainNavItems = [
        { id: "home", label: "Home", active: true },
        { id: "trade", label: "Trade", active: false },
    ];

    const subNavItems = [
        { id: "overview", label: "Overview", active: true },
        { id: "clients", label: "Clients", active: false },
    ];

    // Placeholder for notification count
    const notificationCount = 5; // Example notification count

    return (
        <header className="flex flex-col items-center w-full bg-white dark:bg-gray-900 shadow-sm">
            {/* Main navigation */}
            <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between px-8">
                <div className="flex items-center gap-x-8">
                    {/* You can add a logo here if needed */}
                    {/* <img src="/logo.svg" alt="Logo" className="h-8" /> */}
                    <nav>
                        <Tabs
                            defaultValue={
                                mainNavItems.find((item) => item.active)?.id || "home"
                            }
                            className="w-auto"
                        >
                            <TabsList className="bg-transparent p-0 h-auto gap-1">
                                {mainNavItems.map((item) => (
                                    <TabsTrigger
                                        key={item.id}
                                        value={item.id}
                                        className={`px-3 py-2 rounded-md h-auto data-[state=active]:bg-gray-50 dark:data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white dark:data-[state=inactive]:bg-gray-900 data-[state=active]:shadow-sm`}
                                    >
                                        <span className="font-medium text-gray-700 dark:text-gray-300">
                                            {item.label}
                                        </span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="p-2.5 rounded-md relative text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
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

            <Separator className="w-full bg-gray-200 dark:bg-gray-700" />

            {/* Sub navigation */}
            <div className="flex w-full max-w-[1280px] h-16 items-center justify-between px-8">
                <nav>
                    <Tabs
                        defaultValue={
                            subNavItems.find((item) => item.active)?.id || "overview"
                        }
                        className="w-auto"
                    >
                        <TabsList className="bg-transparent p-0 h-auto gap-1">
                            {subNavItems.map((item) => (
                                <TabsTrigger
                                    key={item.id}
                                    value={item.id}
                                    className={`px-3 py-2 rounded-md h-auto data-[state=active]:bg-gray-50 dark:data-[state=active]:bg-gray-800 data-[state=inactive]:bg-white dark:data-[state=inactive]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=inactive]:text-gray-500 dark:data-[state=inactive]:text-gray-400`}
                                >
                                    <span className="font-medium">
                                        {item.label}
                                    </span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </nav>

                <div className="w-80">
                    <div className="relative">
                        <Input
                            className="pl-10 pr-3 py-2.5 h-11 bg-white dark:bg-gray-800 rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:text-gray-200"
                            placeholder="Search..."
                        />
                        <SearchIcon className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    </div>
                </div>
            </div>
            {/* You might not need a bottom separator, or you can add one if the design requires it */}
            {/* <Separator className="w-full" /> */}
        </header>
    );
}