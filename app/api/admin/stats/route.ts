import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function GET() {
  try {
    await connectToDatabase()

    const totalUsers = await User.countDocuments()
    
    // Calculate total queries across all users using MongoDB Aggregation
    const result = await User.aggregate([
      {
        $group: {
          _id: null,
          totalQueriesAnalyzed: { $sum: "$totalQueries" }
        }
      }
    ])

    const totalQueries = result.length > 0 ? result[0].totalQueriesAnalyzed : 0

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers,
        totalQueries
      }
    })
  } catch (error: any) {
    console.error("Admin stats error:", error)
    return NextResponse.json({ error: "Failed to fetch aggregated statistics" }, { status: 500 })
  }
}
