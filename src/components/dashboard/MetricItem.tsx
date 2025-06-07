'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, TrendingUp } from "lucide-react";
import React, { JSX } from "react";
import Image from "next/image";

// Interface for MetricItem props to make it reusable
interface MetricItemProps {
    title: string;
    value: string;
    percentageChange: number;
    isPositiveChange: boolean;
    comparisonPeriod: string;
    chartSrc?: string; // Optional: if you have a small chart image
}

export default function MetricItem({ 
    title, 
    value, 
    percentageChange, 
    isPositiveChange, 
    comparisonPeriod,
    chartSrc = "/placeholder-chart.svg" // Default placeholder if no chartSrc is provided
}: MetricItemProps): JSX.Element {
    const trendColor = isPositiveChange ? "text-success-700 dark:text-success-500" : "text-destructive-700 dark:text-destructive-500";
    // You might need to define these colors in your tailwind.config.mjs if they don't exist
    // e.g., success-700, destructive-700

    return (
        <Card className="border border-gray-200 dark:border-gray-700 w-[390px] h-[176px]">
            <CardContent className="flex flex-col gap-6 p-[24px]">
                <div className="flex items-start justify-between w-full">
                    <h3 className="text-gray-900 dark:text-gray-100 font-semibold text-md">
                        {title}
                    </h3>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                                <MoreVertical className="h-5 w-5" />
                                <span className="sr-only">More options</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                            <DropdownMenuItem className="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">View details</DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Export data</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-end justify-between w-full gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-gray-900 dark:text-gray-100 text-3xl font-semibold">
                            {value}
                        </p>

                        <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1 ${trendColor}`}>
                                <TrendingUp className="h-4 w-4" /> {/* Adjusted size slightly */}
                                <span className="text-sm font-medium">
                                    {isPositiveChange ? '+' : ''}{percentageChange}%
                                </span>
                            </div>
                            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">
                                {comparisonPeriod}
                            </span>
                        </div>
                    </div>

                    {chartSrc && (
                        <div className="w-24 h-12 relative">
                            <Image 
                                src={chartSrc} 
                                alt={`${title} chart`} 
                                fill
                                style={{ objectFit: 'contain' }}
                            />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}