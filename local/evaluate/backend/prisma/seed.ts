import { PrismaClient, type EmploymentType, type SkillMode } from "@prisma/client";

const prisma = new PrismaClient();

const stores = [
  { id: "store-downtown", name: "Downtown Flagship", region: "Central", managerName: "Amelia Chen", city: "Sydney" },
  { id: "store-harbor", name: "Harbor Market", region: "East", managerName: "Noah Patel", city: "Sydney" },
  { id: "store-northline", name: "Northline", region: "North", managerName: "Mia Roberts", city: "Chatswood" },
  { id: "store-westfield", name: "Westfield Plaza", region: "West", managerName: "Lucas Nguyen", city: "Parramatta" },
];

const employees = [
  employee("emp-001", "store-downtown", "Molly Carter", "FullTime"),
  employee("emp-002", "store-downtown", "Ethan Brooks", "FullTime"),
  employee("emp-003", "store-downtown", "Sofia Rivera", "PartTime"),
  employee("emp-004", "store-downtown", "Liam Wilson", "FullTime"),
  employee("emp-005", "store-downtown", "Ava Morgan", "Casual"),
  employee("emp-006", "store-harbor", "Oliver Stone", "FullTime"),
  employee("emp-007", "store-harbor", "Grace Kim", "FullTime"),
  employee("emp-008", "store-harbor", "Henry Walker", "PartTime"),
  employee("emp-009", "store-harbor", "Isla Wright", "FullTime"),
  employee("emp-010", "store-harbor", "Jack Young", "Casual"),
  employee("emp-011", "store-northline", "Charlotte Evans", "FullTime"),
  employee("emp-012", "store-northline", "Leo Harris", "PartTime"),
  employee("emp-013", "store-northline", "Nora Scott", "FullTime"),
  employee("emp-014", "store-northline", "Mason Hall", "FullTime"),
  employee("emp-015", "store-northline", "Ella Green", "Casual"),
  employee("emp-016", "store-westfield", "James Adams", "FullTime"),
  employee("emp-017", "store-westfield", "Chloe Baker", "FullTime"),
  employee("emp-018", "store-westfield", "Daniel Carter", "PartTime"),
  employee("emp-019", "store-westfield", "Ruby Nelson", "FullTime"),
  employee("emp-020", "store-westfield", "Oscar Mitchell", "FullTime"),
];

const skills = [
  skill("tea-preparation", "开茶", "Tea Preparation", "Back Kitchen", 1.5, 10),
  skill("milk-bar", "奶吧", "Milk Bar", "Back Kitchen", 1.5, 20),
  skill("cup-labeling", "贴杯", "Cup Labeling", "Bar", 0.7, 30),
  skill("order-scanning", "扫码", "Order Scanning", "Bar", 0.7, 40),
  skill("ice-station", "加冰", "Ice Station", "Bar", 0.8, 50),
  skill("cup-finishing", "炫杯", "Cup Finishing", "Bar", 1, 60),
  skill("handoff", "中转", "Handoff", "Front", 1.1, 70),
  skill("delivery-packing", "外卖打包", "Delivery Packing", "Front", 0.8, 80),
  skill("drink-handoff", "出杯", "Drink Handoff", "Front", 1, 90),
  skill("order-taking", "点单", "Order Taking", "Front", 1.4, 100),
  skill("opening", "开早", "Opening", "Operations", 1, 110, "BINARY"),
  skill("closing", "收晚", "Closing", "Operations", 1, 120, "BINARY"),
  skill("weekly-cleaning", "周清", "Weekly Cleaning", "Operations", 1, 130, "BINARY"),
];

async function main() {
  for (const store of stores) {
    await prisma.store.upsert({ where: { id: store.id }, update: store, create: store });
  }

  for (const worker of employees) {
    await prisma.employee.upsert({
      where: { id: worker.id },
      update: worker,
      create: worker,
    });
  }

  for (const definition of skills) {
    await prisma.skillDefinition.upsert({
      where: { code: definition.code },
      update: definition,
      create: definition,
    });
  }
}

function employee(
  id: string,
  storeId: string,
  displayName: string,
  employmentType: EmploymentType,
) {
  return { id, storeId, displayName, employmentType };
}

function skill(code: string, nameZh: string, nameEn: string, category: string, weight: number, displayOrder: number, skillMode: SkillMode = "PROGRESSIVE") {
  return { code, nameZh, nameEn, category, weight, displayOrder, skillMode, isActive: true };
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
