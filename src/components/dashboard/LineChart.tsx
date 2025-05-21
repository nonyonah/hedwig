import {
    Card,
    CardContent,
    CardDescription,
    CardTitle,
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import React, { JSX } from "react";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LineChartProps {
  data: Array<{ day: string; value: number }>; // Matches 'name' to 'day' for XAxis dataKey
  title: string;
  description: string;
}

export default function LineChart({ data, title, description }: LineChartProps): JSX.Element {
    // Data for the days of the week - this can be derived from props or kept static if always weekly
    // For dynamic XAxis based on data, Recharts XAxis dataKey will use 'day' from the data prop

    return (
        <Card className="w-full mb-8 rounded-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-5 h-full">
                <div className="h-full flex flex-col gap-[30px]">
                    <header className="flex items-center justify-between">
                        <div className="flex flex-col gap-[5px]">
                            <CardTitle className="text-gray-900 dark:text-gray-100 font-semibold">
                                {title}
                            </CardTitle>
                            <CardDescription className="text-gray-500 dark:text-gray-400 text-xs">
                                {description}
                            </CardDescription>
                        </div>

                        <Select defaultValue="weekly">
                            <SelectTrigger className="w-auto bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 shadow-shadow-xs">
                                <SelectValue placeholder="Weekly" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                    </header>

                    <div className="relative w-full h-64 md:h-72"> {/* Adjusted height for responsiveness */}
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsLineChart data={data}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                                <XAxis 
                                    dataKey="day" // Assumes 'day' is the key in your data objects for x-axis labels
                                    axisLine={false} 
                                    tickLine={false} 
                                    className="text-xs text-gray-600 dark:text-gray-400"
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    className="text-xs text-gray-600 dark:text-gray-400"
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)', // White with opacity
                                        borderColor: '#9E77ED',
                                        borderRadius: '0.375rem', // Equivalent to rounded-md
                                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', // shadow-sm
                                        color: '#374151' // text-gray-700
                                    }}
                                    labelStyle={{ color: '#1F2937', fontWeight: '600' }} // text-gray-800, font-semibold
                                    cursor={{ fill: 'rgba(158, 119, 237, 0.1)' }} // Light purple fill for cursor
                                />
                                <Line
                                    type="monotone"
                                    dataKey="value" // Assumes 'value' is the key in your data objects for y-axis values
                                    stroke="#8B5CF6" // Purple color for the line
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: '#FFFFFF' }} // Customize dots
                                    activeDot={{ r: 6, fill: '#8B5CF6', strokeWidth: 2, stroke: '#FFFFFF' }} // Customize active dots
                                />
                            </RechartsLineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}