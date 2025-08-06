"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"

const steps = [
  { id: 1, name: "Upload Document", description: "Upload your document" },
  { id: 2, name: "Ask Questions", description: "Query document" },
  { id: 3, name: "Get Results", description: "View AI analysis" },
]

export function ProgressStepper() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const step = Number.parseInt(localStorage.getItem("currentStep") || "0")
      setCurrentStep(step)
    }
  }, [])

  return (
    <div className="w-full max-w-3xl mx-auto mb-8">
      <nav aria-label="Progress">
        <ol className="flex items-center">
          {steps.map((step, stepIdx) => (
            <li key={step.name} className="flex items-center">
              <div className="flex items-center">
                <span
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep > step.id
                      ? "bg-primary text-primary-foreground"
                      : currentStep === step.id
                        ? "border-2 border-primary text-primary"
                        : "border-2 border-muted-foreground text-muted-foreground"
                  }`}
                >
                  {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                </span>
                <div className="ml-3 text-sm font-medium">
                  <p className="text-foreground">{step.name}</p>
                  {currentStep > step.id && <p className="text-xs text-muted-foreground">{step.description}</p>}
                </div>
              </div>
              {stepIdx !== steps.length - 1 && (
                <div
                  className={`flex-auto border-t-2 ${
                    currentStep > step.id ? "border-primary" : "border-muted-foreground"
                  } ml-3`}
                />
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
