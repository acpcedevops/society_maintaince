import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const RESIDENTS = [
  "Rajesh Kumar", "Sunita Sharma", "Amit Patel", "Meera Joshi",
  "Vikram Singh", "Priya Nair", "Rohan Mehta", "Anita Desai",
  "Karan Malhotra", "Divya Rao", "Sanjay Gupta", "Kavita Menon",
  "Rahul Verma", "Pooja Reddy", "Arjun Iyer", "Neha Kapoor",
  "Manish Jain", "Shreya Bhatt", "Deepak Joshi", "Ritu Agarwal",
  "Alok Saxena", "Nisha Pillai", "Tarun Khanna", "Farah Khan",
  "Gaurav Bhatia", "Sonal Kulkarni", "Harsh Vora", "Tanvi Chawla",
];

async function main() {
  console.log("Seeding Neev Plaza...");

  await prisma.notice.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.maintenanceConfig.deleteMany();

  const categoryNames = [
    "Electrician", "Plumber", "Cleaning", "Security", "Lift Maintenance",
    "Repairs", "Utilities", "Gardening", "Salary", "Other",
  ];
  for (const name of categoryNames) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  const categories = await prisma.expenseCategory.findMany();

  await prisma.maintenanceConfig.create({
    data: {
      name: "Monthly Maintenance",
      amount1bhk: 1200,
      amount2bhk: 1729,
      lateFeePerDay: 1,
      dueDay: 15,
      effectiveFrom: new Date(2026, 0, 1),
    },
  });

  const units = [];
  let idx = 0;
  for (let floor = 1; floor <= 7; floor++) {
    for (let n = 1; n <= 4; n++) {
      const unitNo = `${floor}0${n}`;
      const bhk = n <= 2 ? "1BHK" : "2BHK";
      const ownerName = RESIDENTS[idx];
      const unit = await prisma.unit.create({
        data: { unitNo, floor, bhk, ownerName, occupants: Math.floor(Math.random() * 3) + 2 },
      });
      units.push(unit);
      idx++;
    }
  }

  const adminPass = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: { name: "Neev Plaza Admin", phone: "9999999999", email: "admin@neevplaza.in", passwordHash: adminPass, role: "ADMIN" },
  });

  const memberPass = await bcrypt.hash("member123", 10);
  for (const [i, unit] of units.entries()) {
    const firstName = unit.ownerName.split(" ")[0].toLowerCase();
    await prisma.user.create({
      data: {
        name: unit.ownerName,
        phone: `9000000${String(i).padStart(3, "0")}`,
        email: `${firstName}@neevplaza.in`,
        passwordHash: memberPass,
        role: "MEMBER",
        unitId: unit.id,
        isOwner: true,
      },
    });
  }

  const year = 2026;
  for (let m = 1; m <= 8; m++) {
    for (const [i, unit] of units.entries()) {
      const amount = unit.bhk === "2BHK" ? 1729 : 1200;
      const bill = await prisma.bill.create({
        data: { unitId: unit.id, month: m, year, amount, status: "PENDING", dueDate: new Date(year, m - 1, 15) },
      });

      let paid;
      if (i === 0) paid = m <= 6; // demo member pays Jan–Jun, July + Aug pending (late fee demo)
      else paid = (i + m) % 3 !== 0;

      if (paid) {
        const daysLate = i === 0 ? 0 : m === 8 ? 0 : i % 6;
        const paidDay = Math.min(15 + daysLate, 27);
        const paidAt = new Date(year, m - 1, paidDay);
        const lateFee = daysLate * 1;
        const invoiceNo = `NP-${year}-${String(bill.id).padStart(4, "0")}`;
        await prisma.bill.update({
          where: { id: bill.id },
          data: { status: "PAID", paidAt, lateFee, paymentMethod: i % 2 === 0 ? "ONLINE" : "CASH", invoiceNo },
        });
        await prisma.paymentTransaction.create({
          data: { billId: bill.id, amount: amount + lateFee, method: i % 2 === 0 ? "ONLINE" : "CASH", status: "PAID" },
        });
      }
    }
  }

  const cat = (name) => categories.find((c) => c.name === name).id;
  const admin = await prisma.user.findUnique({ where: { phone: "9999999999" } });
  const expenses = [
    ["Electrician", "Sharma Electricals", 850, 2026, 3, 4, "Repair of lobby lights"],
    ["Plumber", "Raju Plumbing", 1200, 2026, 3, 9, "Water pipe leak near gate"],
    ["Cleaning", "CleanPro Services", 3000, 2026, 4, 1, "Monthly deep cleaning"],
    ["Security", "SafeGuard Agency", 15000, 2026, 4, 5, "Monthly security staff"],
    ["Lift Maintenance", "LiftCare Co.", 3500, 2026, 5, 12, "Quarterly lift AMC"],
    ["Utilities", "BESCOM", 4200, 2026, 5, 18, "Common area electricity bill"],
    ["Gardening", "GreenThumb", 2000, 2026, 6, 2, "Monthly garden maintenance"],
    ["Repairs", "Kamal Traders", 2600, 2026, 6, 20, "Overhead tank cleaning + repair"],
    ["Salary", "Sanjay - Watchman", 9000, 2026, 7, 1, "Salary for July"],
    ["Repairs", "Rajesh Hardware", 1750, 2026, 7, 10, "Repair of main gate motor"],
    ["Security", "SafeGuard Agency", 15000, 2026, 8, 5, "Monthly security staff"],
    ["Cleaning", "CleanPro Services", 3000, 2026, 8, 8, "Monthly deep cleaning"],
  ];
  for (const [catName, vendor, amount, y, m, d, description] of expenses) {
    await prisma.expense.create({
      data: { categoryId: cat(catName), vendor, amount, date: new Date(y, m - 1, d), description, createdById: admin.id },
    });
  }

  const member1 = await prisma.user.findUnique({ where: { phone: "9000000000" } });
  const member2 = await prisma.user.findUnique({ where: { phone: "9000000001" } });
  await prisma.notice.create({
    data: {
      title: "Maintenance due for August 2026",
      body: "Dear members, kindly clear your pending maintenance for August 2026 before the 15th. A late fee of Rs.1 per day applies from the 16th. You can pay online through the app.",
      createdById: admin.id,
    },
  });
  await prisma.notice.create({
    data: {
      title: "Maintenance charges revised from July 2026",
      body: "1 BHK units: Rs.1,200/month. 2 BHK units: Rs.1,729/month. Payments after the 15th of each month attract a late fee of Rs.1 per day.",
      createdById: admin.id,
    },
  });
  await prisma.complaint.create({
    data: { userId: member1.id, unitId: member1.unitId, category: "PLUMBING", title: "Kitchen tap leaking", description: "Water leaking continuously from kitchen tap, need plumber.", priority: "HIGH", status: "OPEN" },
  });
  await prisma.complaint.create({
    data: { userId: member2.id, unitId: member2.unitId, category: "ELECTRICAL", title: "Lobby light not working", description: "Tube light on 1st floor lobby is fused since 2 days.", priority: "NORMAL", status: "IN_PROGRESS", adminNote: "Electrician scheduled for tomorrow." },
  });

  console.log("Seeding complete!");
  console.log("Units       : 28 (7 floors x 4 flats)");
  console.log("Maintenance : 1BHK Rs.1200 | 2BHK Rs.1729 | late fee Rs.1/day after 15th");
  console.log("Admin login : 9999999999 / admin123");
  console.log("Member login: 9000000000 / member123 (Unit 101, July+Aug unpaid - shows late fee)");
}

main().finally(() => prisma.$disconnect());
