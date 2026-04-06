"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}

function PaymentContent() {
  const searchParams = useSearchParams();
  const teamIdsParam = searchParams.get("team_ids");
  const namesParam = searchParams.get("names");

  const teamIds = teamIdsParam ? teamIdsParam.split(",") : [];
  const teamNames = namesParam ? decodeURIComponent(namesParam).split(",") : [];
  const teamCount = teamIds.length || 1;
  const totalAmount = teamCount * 30;

  // Build the Venmo note suggestion
  const noteText = teamNames.length > 0
    ? `4DIA: ${teamNames.join(", ")}`
    : "4DIA: [Your Team Name]";

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mx-auto mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Complete Your Payment</h1>
        <p className="text-muted-foreground">
          Scan the QR code below to pay via Venmo
        </p>
      </div>

      {/* Payment Amount */}
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="py-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Amount Due</span>
            <span className="font-bold text-2xl">${totalAmount}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {teamCount} team{teamCount > 1 ? "s" : ""} x $30
          </p>
        </CardContent>
      </Card>

      {/* Venmo QR Code */}
      <Card className="mb-6">
        <CardHeader className="pb-2 text-center">
          <CardTitle className="text-lg">Pay with Venmo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <div className="bg-white p-4 rounded-lg mb-4">
            <Image
              src="/venmo-qr.png"
              alt="Venmo QR Code for @pyoung"
              width={200}
              height={200}
              className="mx-auto"
            />
          </div>
          <p className="text-lg font-semibold text-primary">@pyoung</p>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Payment Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="shrink-0 mt-0.5">1</Badge>
            <div>
              <p className="font-medium">Scan the QR code or search for @pyoung</p>
              <p className="text-sm text-muted-foreground">Open Venmo and scan the code above</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="shrink-0 mt-0.5">2</Badge>
            <div>
              <p className="font-medium">Enter ${totalAmount} and select &quot;Gift&quot;</p>
              <p className="text-sm text-muted-foreground">Make sure to label the payment as a gift</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="shrink-0 mt-0.5">3</Badge>
            <div>
              <p className="font-medium">Add your team name(s) in the note</p>
              <p className="text-sm text-muted-foreground">
                Suggested note: <span className="font-mono bg-muted px-1 rounded">{noteText}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Important Notice */}
      <div className="bg-muted/50 rounded-lg p-4 mb-6">
        <p className="text-sm text-muted-foreground">
          <strong>Important:</strong> Your entry will be confirmed once we verify your Venmo payment.
          Entries without payment will be removed before the tournament starts.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <Button asChild className="min-h-[44px] bg-primary hover:bg-primary/90">
          <Link href={`/submit/success?team_ids=${teamIds.join(",")}`}>
            I&apos;ve Completed Payment
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link href="/teams/builder">
            Go Back
          </Link>
        </Button>
      </div>
    </div>
  );
}
