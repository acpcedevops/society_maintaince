const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateUsername } = require('../src/lib/society');

const prisma = new PrismaClient();

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function dueDateFor(year, month, dueDay) {
  return new Date(Date.UTC(year, month - 1, dueDay) - IST_OFFSET);
}

const DEFAULT_CATEGORIES = [
  'Electrician', 'Plumber', 'Cleaning', 'Security', 'Lift Maintenance',
  'Repairs', 'Utilities', 'Gardening', 'Salary', 'Other',
];

async function seedSociety(spec) {
  const society = await prisma.society.create({
    data: { name: spec.name, code: spec.code, address: spec.address || null },
  });

  const config = await prisma.maintenanceConfig.create({
    data: {
      societyId: society.id,
      name: spec.config.name || 'Monthly Maintenance',
      amount1bhk: spec.config.amount1bhk,
      amount2bhk: spec.config.amount2bhk,
      lateFeePerDay: spec.config.lateFeePerDay ?? 1,
      dueDay: spec.config.dueDay ?? 15,
      effectiveFrom: new Date(spec.config.effectiveFrom || '2026-01-01T00:00:00+05:30'),
      active: true,
    },
  });

  await prisma.securityPolicy.create({
    data: {
      societyId: society.id,
      mode: spec.gateMode || 'GATED',
      requireOtpForDelivery: spec.requireOtpForDelivery ?? true,
      guardCanOverride: spec.guardCanOverride ?? true,
      dropPointEnabled: spec.dropPointEnabled ?? true,
      dropPointLabel: spec.dropPointLabel || 'Gate / Lobby',
    },
  });

  const unitByNo = {};
  for (const u of spec.units) {    const created = await prisma.unit.create({
      data: {
        societyId: society.id,
        unitNo: u.unitNo,
        floor: u.floor,
        bhk: u.bhk,
        occupants: u.occupants ?? 0,
        ownerName: u.ownerName ?? null,
        amountOverride: u.amountOverride ?? null,
      },
    });
    unitByNo[u.unitNo] = created;
  }

  const admin = await prisma.user.create({
    data: {
      societyId: society.id,
      name: spec.admin.name,
      phone: spec.admin.phone,
      username: await generateUsername(spec.admin.phone, society.id),
      email: spec.admin.email || null,
      passwordHash: await bcrypt.hash(spec.admin.password || 'admin123', 10),
      role: 'ADMIN',
      isOwner: false,
    },
  });

  const guard = await prisma.user.create({
    data: {
      societyId: society.id,
      name: spec.guard?.name || 'Gate Guard',
      phone: spec.guard?.phone || '9999900000',
      username: await generateUsername(spec.guard?.phone || '9999900000', society.id),
      email: spec.guard?.email || null,
      passwordHash: await bcrypt.hash(spec.guard?.password || 'guard123', 10),
      role: 'GUARD',
      isOwner: false,
    },
  });

  const memberPass = await bcrypt.hash(spec.memberPassword || 'member123', 10);  const membersByUnit = {};
  for (const m of spec.members) {
    const created = await prisma.user.create({
      data: {
        societyId: society.id,
        name: m.name,
        phone: m.phone,
        username: await generateUsername(m.phone, society.id),
        email: m.email || null,
        passwordHash: memberPass,
        role: 'MEMBER',
        unitId: unitByNo[m.unitNo].id,
        isOwner: true,
      },
    });
    membersByUnit[m.unitNo] = created;
  }

  const year = spec.year || 2026;
  const months = spec.months || [1, 2, 3, 4, 5, 6, 7, 8];
  const paidThrough = spec.paidThrough ?? 6;
  const unitNos = spec.units.map((u) => u.unitNo);
  for (const unitNo of unitNos) {
    const unit = unitByNo[unitNo];
    const amount = unit.amountOverride ?? (unit.bhk === '2BHK' ? config.amount2bhk : config.amount1bhk);
    const idx = unitNos.indexOf(unitNo);
    for (const month of months) {
      const dueDate = dueDateFor(year, month, config.dueDay);
      const paid = month <= paidThrough && !(idx % 4 === 0 && month === paidThrough);
      const bill = await prisma.bill.create({
        data: {
          unitId: unit.id,
          month,
          year,
          amount,
          lateFee: 0,
          status: paid ? 'PAID' : 'PENDING',
          dueDate,
          paidAt: paid ? dueDate : null,
          paymentMethod: paid ? 'ONLINE' : null,
        },
      });
      if (paid) {
        await prisma.transaction.create({
          data: { billId: bill.id, amount, method: idx % 3 === 0 ? 'CASH' : 'ONLINE', status: 'PAID' },
        });
      }
    }
  }

  for (const c of spec.complaints || []) {
    await prisma.complaint.create({
      data: {
        societyId: society.id,
        userId: membersByUnit[c.unit].id,
        unitId: unitByNo[c.unit].id,
        category: c.category,
        title: c.title,
        description: c.description,
        priority: c.priority || 'NORMAL',
        status: c.status || 'OPEN',
        adminNote: c.adminNote || null,
      },
    });
  }

  for (const n of spec.notices || []) {
    await prisma.notice.create({
      data: { societyId: society.id, title: n.title, body: n.body, createdById: admin.id },
    });
  }

  const catByName = {};
  for (const name of spec.categories || DEFAULT_CATEGORIES) {
    catByName[name] = await prisma.expenseCategory.create({ data: { societyId: society.id, name } });
  }

  for (const e of spec.expenses || []) {
    await prisma.expense.create({
      data: {
        societyId: society.id,
        categoryId: catByName[e.category].id,
        vendor: e.vendor,
        amount: e.amount,
        date: new Date(`${e.date}T00:00:00+05:30`),
        description: e.description || null,
        createdById: admin.id,
      },
    });
  }

  const firstUnit = unitByNo[unitNos[0]];
  const secondUnit = unitByNo[unitNos[1] || unitNos[0]];
  const now = new Date();

  const pendingEntry = await prisma.gateEntry.create({
    data: {
      societyId: society.id,
      unitId: firstUnit.id,
      type: 'GUEST',
      name: 'Ravi (Friend)',
      phone: '9876500001',
      purpose: 'Personal visit',
      status: 'PENDING',
      createdById: guard.id,
      loggedById: guard.id,
      otpExpiresAt: new Date(now.getTime() + 120 * 60000),
    },
  });
  await prisma.notification.create({
    data: {
      societyId: society.id,
      userId: membersByUnit[unitNos[0]].id,
      type: 'VISITOR_REQUEST',
      title: 'Visitor at gate',
      body: `Ravi (Friend) for unit ${unitNos[0]}`,
      link: '/gate',
      meta: { entryId: pendingEntry.id },
    },
  });

  const deliveryEntry = await prisma.gateEntry.create({
    data: {
      societyId: society.id,
      unitId: secondUnit.id,
      type: 'DELIVERY',
      name: 'Amazon',
      purpose: 'Amazon',
      status: 'APPROVED',
      createdById: guard.id,
      loggedById: guard.id,
      decisionById: admin.id,
      enteredAt: now,
      otp: '123456',
      otpExpiresAt: new Date(now.getTime() + 120 * 60000),
    },
  });
  await prisma.package.create({
    data: {
      societyId: society.id,
      gateEntryId: deliveryEntry.id,
      unitId: secondUnit.id,
      partner: 'Amazon',
      count: 1,
      placement: 'DROPBOX',
      status: 'WAITING',
    },
  });
  await prisma.notification.create({
    data: {
      societyId: society.id,
      userId: membersByUnit[unitNos[1] || unitNos[0]].id,
      type: 'PACKAGE_WAITING',
      title: 'Package waiting for you',
      body: `Amazon left at DROPBOX for unit ${unitNos[1] || unitNos[0]}`,
      link: '/gate',
      meta: { entryId: deliveryEntry.id },
    },
  });

  await prisma.gateEntry.create({
    data: {
      societyId: society.id,
      unitId: firstUnit.id,
      type: 'CAB',
      name: 'Ola KA-01-AB-1234',
      purpose: 'Ride',
      status: 'APPROVED',
      createdById: guard.id,
      loggedById: guard.id,
      decisionById: admin.id,
    },
  });

  return { society, admin, guard, unitByNo, membersByUnit };
}

/* ----------------------------- Neev Plaza ----------------------------- */

const NEEV_UNITS = [
  ['101', 1, '1BHK', 2, 'Rajesh Kumar'],
  ['102', 1, '1BHK', 2, 'Sunita Sharma'],
  ['103', 1, '2BHK', 4, 'Amit Patel'],
  ['104', 1, '2BHK', 3, 'Meera Joshi'],
  ['201', 2, '1BHK', 4, 'Vikram Singh'],
  ['202', 2, '1BHK', 2, 'Priya Nair'],
  ['203', 2, '2BHK', 2, 'Rohan Mehta'],
  ['204', 2, '2BHK', 2, 'Anita Desai'],
  ['301', 3, '1BHK', 2, 'Karan Malhotra'],
  ['302', 3, '1BHK', 3, 'Divya Rao'],
  ['303', 3, '2BHK', 2, 'Sanjay Gupta'],
  ['304', 3, '2BHK', 3, 'sarin deore'],
  ['401', 4, '1BHK', 4, 'Rahul Verma'],
  ['402', 4, '1BHK', 2, 'Pooja Reddy'],
  ['403', 4, '2BHK', 3, 'Arjun Iyer'],
  ['404', 4, '2BHK', 3, 'Neha Kapoor'],
  ['501', 5, '1BHK', 4, 'Manish Jain'],
  ['502', 5, '1BHK', 2, 'Shreya Bhatt'],
  ['503', 5, '2BHK', 3, 'Deepak Joshi'],
  ['504', 5, '2BHK', 4, 'Ritu Agarwal'],
  ['601', 6, '1BHK', 2, 'Alok Saxena'],
  ['602', 6, '1BHK', 4, 'Nisha Pillai'],
  ['603', 6, '2BHK', 3, 'Tarun Khanna'],
  ['604', 6, '2BHK', 4, 'Farah Khan'],
  ['701', 7, '1BHK', 3, 'Gaurav Bhatia'],
  ['702', 7, '1BHK', 2, 'Sonal Kulkarni'],
  ['703', 7, '2BHK', 2, 'Harsh Vora'],
  ['704', 7, '2BHK', 4, 'Tanvi Chawla'],
  ['801', 8, '1BHK', 1, 'varsha deore'],
].map(([unitNo, floor, bhk, occupants, ownerName]) => ({
  unitNo,
  floor,
  bhk,
  occupants,
  ownerName,
  amountOverride: unitNo === '304' ? 1729 : unitNo === '801' ? 1200 : null,
}));

const NEEV_MEMBERS = [
  ['Rajesh Kumar', '9000000000', 'rajesh@neevplaza.in', '101'],
  ['Sunita Sharma', '9000000001', 'sunita@neevplaza.in', '102'],
  ['Amit Patel', '9000000002', 'amit@neevplaza.in', '103'],
  ['Meera Joshi', '9000000003', 'meera@neevplaza.in', '104'],
  ['Vikram Singh', '9000000004', 'vikram@neevplaza.in', '201'],
  ['Priya Nair', '9000000005', 'priya@neevplaza.in', '202'],
  ['Rohan Mehta', '9000000006', 'rohan@neevplaza.in', '203'],
  ['Anita Desai', '9000000007', 'anita@neevplaza.in', '204'],
  ['Karan Malhotra', '9000000008', 'karan@neevplaza.in', '301'],
  ['Divya Rao', '9000000009', 'divya@neevplaza.in', '302'],
  ['Sanjay Gupta', '9000000010', 'sanjay@neevplaza.in', '303'],
  ['sarin shankar deore', '9594390592', 'deore.sareen@gmail.com', '304'],
  ['Rahul Verma', '9000000012', 'rahul@neevplaza.in', '401'],
  ['Pooja Reddy', '9000000013', 'pooja@neevplaza.in', '402'],
  ['Arjun Iyer', '9000000014', 'arjun@neevplaza.in', '403'],
  ['Neha Kapoor', '9000000015', 'neha@neevplaza.in', '404'],
  ['Manish Jain', '9000000016', 'manish@neevplaza.in', '501'],
  ['Shreya Bhatt', '9000000017', 'shreya@neevplaza.in', '502'],
  ['Deepak Joshi', '9000000018', 'deepak@neevplaza.in', '503'],
  ['Ritu Agarwal', '9000000019', 'ritu@neevplaza.in', '504'],
  ['Alok Saxena', '9000000020', 'alok@neevplaza.in', '601'],
  ['Nisha Pillai', '9000000021', 'nisha@neevplaza.in', '602'],
  ['Tarun Khanna', '9000000022', 'tarun@neevplaza.in', '603'],
  ['Farah Khan', '9000000023', 'farah@neevplaza.in', '604'],
  ['Gaurav Bhatia', '9000000024', 'gaurav@neevplaza.in', '701'],
  ['Sonal Kulkarni', '9000000025', 'sonal@neevplaza.in', '702'],
  ['Harsh Vora', '9000000026', 'harsh@neevplaza.in', '703'],
  ['Tanvi Chawla', '9000000027', 'tanvi@neevplaza.in', '704'],
  ['varsha deore', '9594390593', 'varsha@gmail.com', '801'],
].map(([name, phone, email, unitNo]) => ({ name, phone, email, unitNo }));

const NEEV_EXPENSES = [
  ['Cleaning', 'CleanPro Services', 3000, '2026-08-08', 'Monthly deep cleaning'],
  ['Security', 'SafeGuard Agency', 15000, '2026-08-05', 'Monthly security staff'],
  ['Repairs', 'Rajesh Hardware', 1750, '2026-07-10', 'Repair of main gate motor'],
  ['Salary', 'Sanjay - Watchman', 9000, '2026-07-01', 'Salary for July'],
  ['Repairs', 'Kamal Traders', 2600, '2026-06-20', 'Overhead tank cleaning'],
  ['Gardening', 'GreenThumb', 2000, '2026-06-02', 'Monthly garden maintenance'],
  ['Utilities', 'BESCOM', 4200, '2026-05-18', 'Common area electricity bill'],
  ['Lift Maintenance', 'LiftCare Co.', 3500, '2026-05-12', 'Quarterly lift AMC'],
  ['Security', 'SafeGuard Agency', 15000, '2026-04-05', 'Monthly security staff'],
  ['Cleaning', 'CleanPro Services', 3000, '2026-04-01', 'Monthly deep cleaning'],
  ['Plumber', 'Raju Plumbing', 1200, '2026-03-09', 'Water pipe leak near gate'],
  ['Electrician', 'Sharma Electricals', 850, '2026-03-04', 'Repair of lobby lights'],
].map(([category, vendor, amount, date, description]) => ({ category, vendor, amount, date, description }));

/* --------------------------- Green Valley ----------------------------- */

const GV_UNITS = [
  ['A-101', 1, '2BHK', 3, 'Anand Krishnan', null],
  ['A-102', 1, '2BHK', 4, 'Lakshmi Menon', null],
  ['A-201', 2, '3BHK', 5, 'Imran Sheikh', 2500],
  ['A-202', 2, '2BHK', 2, 'Kavya Suresh', null],
  ['B-101', 1, '3BHK', 4, 'Rohit Bansal', 2500],
  ['B-102', 1, '2BHK', 3, 'Sneha Iyer', null],
].map(([unitNo, floor, bhk, occupants, ownerName, amountOverride]) => ({
  unitNo,
  floor,
  bhk,
  occupants,
  ownerName,
  amountOverride,
}));

const GV_MEMBERS = [
  { name: 'Anand Krishnan', phone: '9000000000', email: 'anand@greenvalley.in', unitNo: 'A-101' },
  { name: 'Lakshmi Menon', phone: '9000000001', email: 'lakshmi@greenvalley.in', unitNo: 'A-102' },
  { name: 'Imran Sheikh', phone: '9000000002', email: 'imran@greenvalley.in', unitNo: 'A-201' },
  { name: 'Kavya Suresh', phone: '9000000003', email: 'kavya@greenvalley.in', unitNo: 'A-202' },
  { name: 'Rohit Bansal', phone: '9000000004', email: 'rohit@greenvalley.in', unitNo: 'B-101' },
  { name: 'Sneha Iyer', phone: '9000000005', email: 'sneha@greenvalley.in', unitNo: 'B-102' },
];

const GV_EXPENSES = [
  { category: 'Security', vendor: 'Guardian Security', amount: 18000, date: '2026-08-03', description: 'Security staff - August' },
  { category: 'Utilities', vendor: 'KSEB', amount: 5600, date: '2026-07-22', description: 'Common area electricity' },
  { category: 'Cleaning', vendor: 'SparkleHouse', amount: 4500, date: '2026-07-05', description: 'Monthly housekeeping' },
];

async function main() {
  console.log('Clearing existing data...');
  await prisma.notification.deleteMany();
  await prisma.package.deleteMany();
  await prisma.gateEntry.deleteMany();
  await prisma.securityPolicy.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.maintenanceConfig.deleteMany();
  await prisma.society.deleteMany();

  console.log('Seeding society: Neev Plaza...');
  const neev = await seedSociety({
    name: 'Neev Plaza',
    code: 'NEEV-PLAZA',
    address: 'Baner Road, Pune, Maharashtra',
    config: { amount1bhk: 1200, amount2bhk: 1729, lateFeePerDay: 1, dueDay: 15 },
    units: NEEV_UNITS,
    members: NEEV_MEMBERS,
    admin: { name: 'Neev Plaza Admin', phone: '9999999999', email: 'admin@neevplaza.in', password: 'admin123' },
    memberPassword: 'member123',
    complaints: [
      {
        unit: '101', category: 'PLUMBING', title: 'Kitchen tap leaking',
        description: 'Water leaking from kitchen tap.', priority: 'HIGH', status: 'OPEN',
      },
      {
        unit: '102', category: 'ELECTRICAL', title: 'Lobby light not working',
        description: 'Tube light fused on 1st floor.', priority: 'NORMAL', status: 'IN_PROGRESS',
        adminNote: 'Electrician scheduled.',
      },
    ],
    notices: [
      { title: 'Maintenance due for August 2026', body: 'Dear members, kindly clear your pending maintenance before the 15th.' },
      { title: 'Maintenance charges revised from July 2026', body: '1 BHK: Rs.1,200/month. 2 BHK: Rs.1,729/month.' },
    ],
    expenses: NEEV_EXPENSES,
  });

  console.log('Seeding society: Green Valley Residency...');
  const gv = await seedSociety({
    name: 'Green Valley Residency',
    code: 'GREEN-VALLEY',
    address: 'Whitefield, Bengaluru, Karnataka',
    config: { amount1bhk: 1500, amount2bhk: 2000, lateFeePerDay: 2, dueDay: 10 },
    units: GV_UNITS,
    members: GV_MEMBERS,
    admin: { name: 'Green Valley Admin', phone: '9999999999', email: 'admin@greenvalley.in', password: 'admin123' },
    memberPassword: 'member123',
    months: [4, 5, 6, 7, 8],
    paidThrough: 6,
    complaints: [
      {
        unit: 'A-201', category: 'LIFT', title: 'Lift making noise',
        description: 'Lift in B block makes a grinding noise on the 2nd floor.', priority: 'URGENT', status: 'OPEN',
      },
    ],
    notices: [
      { title: 'Water tanker schedule', body: 'Water tanker will arrive every Tuesday and Friday at 8 AM.' },
    ],
    expenses: GV_EXPENSES,
  });

  console.log('\nSeed complete.');
  console.log('\nSocieties:');
  console.log(`  - ${neev.society.name} (id ${neev.society.id}, code ${neev.society.code})`);
  console.log(`  - ${gv.society.name} (id ${gv.society.id}, code ${gv.society.code})`);
  console.log('\nDemo accounts (log in by choosing the society first):');
  console.log('  Neev Plaza         - Admin  9999999999 / admin123');
  console.log('  Neev Plaza         - Member 9000000000 / member123 (Rajesh Kumar, unit 101)');
  console.log('  Neev Plaza         - Member 9594390592 / member123 (sarin, unit 304)');
  console.log('  Green Valley       - Admin  9999999999 / admin123 (same phone, different society!)');
  console.log('  Green Valley       - Member 9000000000 / member123 (Anand Krishnan, unit A-101)');
  console.log('  Both societies     - Guard  9999900000 / guard123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
