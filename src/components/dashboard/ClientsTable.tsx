import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Added CardTitle
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { CircleDollarSign, Wallet } from "lucide-react";
import React from "react";

// Define client data structure
interface Client {
    name: string;
    lastInvoice: string;
    amountDue: string;
    status: "Paid" | "Unpaid" | "Overdue";
    lastPayment: string;
    // Assuming 'id' from previous version is equivalent to 'walletAddress' or can be added if needed
    // For now, using walletAddress as a unique identifier if available, or you can add 'id' back.
    walletAddress: string; 
}

interface ClientsTableProps {
  clients: Client[];
}

// Helper function to determine badge styling based on status
const getStatusBadge = (status: Client['status']) => { // Added type for status
    switch (status) {
        case "Paid":
            return (
                <Badge className="bg-success-50 text-success-700 hover:bg-success-50 dark:bg-green-700/20 dark:text-green-400 dark:hover:bg-green-700/30">
                    Paid
                </Badge>
            );
        case "Unpaid":
            return (
                <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50 dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30">
                    Unpaid
                </Badge>
            );
        case "Overdue":
            return (
                <Badge className="bg-error-50 text-error-700 hover:bg-error-50 dark:bg-red-700/20 dark:text-red-400 dark:hover:bg-red-700/30">
                    Overdue
                </Badge>
            );
        default:
            // Fallback for any other status, though Client['status'] is a union type
            return <Badge className="dark:bg-gray-700 dark:text-gray-300">{status}</Badge>;
    }
};

export default function ClientsTable({ clients }: ClientsTableProps) {
    return (
        <Card className="w-full border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <CardHeader className="pt-5 pb-[19px] px-6">
                {/* Using CardTitle for consistency with shadcn */}
                <CardTitle className="text-lg font-medium text-gray-900 dark:text-gray-100">Clients</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-gray-50 dark:bg-gray-800">
                        <TableRow>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Name
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 w-[120px]">
                                Last Invoice
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 w-44">
                                Amount Due
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 w-[181px]">
                                Status
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 w-[196px]">
                                Last Payment
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Payment Method
                            </TableHead>
                            <TableHead className="h-11 px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 text-center w-[138px]">
                                Action
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {clients.map((client, index) => (
                            <TableRow key={index} className="h-[72px] border-b dark:border-gray-700">
                                <TableCell className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                                    {client.name}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 w-[120px]">
                                    {client.lastInvoice}
                                </TableCell>
                                <TableCell className="px-6 py-4 w-44">
                                    <div className="flex items-center gap-3">
                                        <CircleDollarSign className="w-10 h-10 text-blue-500 dark:text-blue-400" />
                                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                            {client.amountDue}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="px-6 py-4 w-[181px]">
                                    <div className="mix-blend-multiply">
                                        {getStatusBadge(client.status)}
                                    </div>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 w-[196px]">
                                    {client.lastPayment}
                                </TableCell>
                                <TableCell className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <Wallet className="w-[46px] h-8 text-blue-500 dark:text-blue-400" />
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {client.walletAddress} 
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-center w-[138px]">
                                    <Button
                                        variant="link"
                                        className="text-brand-700 dark:text-brand-400 font-semibold text-sm h-auto p-0 hover:underline"
                                    >
                                        View
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}