import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  registration_date: string | null;
  last_activity: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  segment: "new" | "returning" | "vip";
}

export interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
}

export interface CustomerDetails {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  registration_date: string | null;
  last_activity: string | null;
  orders_count: number;
  total_spent: number;
  avg_order_value: number;
  last_order_at: string | null;
  segment: string;
  recent_orders: CustomerOrder[];
  addresses: CustomerAddress[];
}

export interface CustomerOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string;
  total: number;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface CustomersAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  vipCustomers: number;
}

interface RawProfile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
  updated_at: string | null;
}

interface RawOrder {
  id: string;
  order_number: string | null;
  user_id: string | null;
  email: string | null;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  updated_at: string | null;
  shipping_address: any;
  billing_address: any;
}

interface InternalCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  registration_date: string | null;
  last_activity: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  is_registered: boolean;
  orders: RawOrder[];
}

async function fetchAggregatedCustomers(): Promise<CustomerRow[]> {
  const [ordersRes, profilesRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, user_id, email, status, payment_status, total, created_at, updated_at, shipping_address, billing_address"),
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, phone, avatar_url, role, created_at, updated_at"),
  ]);

  if (ordersRes.error) throw ordersRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const orders = (ordersRes.data ?? []) as RawOrder[];
  const profiles = (profilesRes.data ?? []) as RawProfile[];

  // Profile lookup maps
  const profileById = new Map<string, RawProfile>();
  const profileByEmail = new Map<string, RawProfile>();

  for (const p of profiles) {
    if (p.role === "admin") continue;
    profileById.set(p.id, p);
    if (p.email && p.email.trim()) {
      profileByEmail.set(p.email.trim().toLowerCase(), p);
    }
  }

  const customerMap = new Map<string, InternalCustomer>();

  // 1. Process ORDERS first as the primary source of truth
  for (const o of orders) {
    const orderEmail = o.email ? o.email.trim().toLowerCase() : "";

    // Determine matching registered profile
    let matchedProfile: RawProfile | undefined;
    if (o.user_id && profileById.has(o.user_id)) {
      matchedProfile = profileById.get(o.user_id);
    } else if (orderEmail && profileByEmail.has(orderEmail)) {
      matchedProfile = profileByEmail.get(orderEmail);
    }

    const isRegistered = Boolean(matchedProfile);

    // Canonical key for aggregation
    const canonicalKey = orderEmail || (matchedProfile ? matchedProfile.id : o.id);

    // Extract address data
    const shipping =
      typeof o.shipping_address === "object" && o.shipping_address !== null
        ? (o.shipping_address as Record<string, any>)
        : {};
    const billing =
      typeof o.billing_address === "object" && o.billing_address !== null
        ? (o.billing_address as Record<string, any>)
        : {};

    const guestFirst = (
      shipping.firstName ||
      shipping.first_name ||
      billing.firstName ||
      billing.first_name ||
      ""
    )
      .toString()
      .trim();

    const guestLast = (
      shipping.lastName ||
      shipping.last_name ||
      billing.lastName ||
      billing.last_name ||
      ""
    )
      .toString()
      .trim();

    const guestPhone =
      (shipping.phone || billing.phone || "").toString().trim() || null;

    if (!customerMap.has(canonicalKey)) {
      const primaryEmail =
        matchedProfile?.email?.trim() ||
        o.email?.trim() ||
        "";

      const primaryFirst =
        matchedProfile?.first_name?.trim() ||
        guestFirst ||
        (guestLast ? "" : "Guest Customer");

      const primaryLast =
        matchedProfile?.last_name?.trim() ||
        guestLast ||
        "";

      const primaryPhone =
        matchedProfile?.phone?.trim() ||
        guestPhone;

      customerMap.set(canonicalKey, {
        id: matchedProfile ? matchedProfile.id : o.id,
        first_name: primaryFirst || null,
        last_name: primaryLast || null,
        email: primaryEmail || "—",
        phone: primaryPhone,
        avatar_url: matchedProfile?.avatar_url ?? null,
        registration_date: isRegistered ? matchedProfile!.created_at : null,
        last_activity: o.created_at,
        orders_count: 0,
        total_spent: 0,
        last_order_at: null,
        is_registered: isRegistered,
        orders: [],
      });
    }

    const customer = customerMap.get(canonicalKey)!;

    // Fill missing names from address if available
    if ((!customer.first_name || customer.first_name === "Guest Customer") && guestFirst) {
      customer.first_name = guestFirst;
      if (!customer.last_name && guestLast) {
        customer.last_name = guestLast;
      }
    }
    if ((!customer.email || customer.email === "—") && o.email) {
      customer.email = o.email.trim();
    }
    if (!customer.phone && guestPhone) {
      customer.phone = guestPhone;
    }

    // Accumulate order metrics
    customer.orders_count += 1;
    const orderTotal = Number(o.total ?? 0);
    if (o.status !== "cancelled" && o.status !== "refunded") {
      customer.total_spent += orderTotal;
    }
    customer.orders.push(o);

    if (!customer.last_order_at || new Date(o.created_at) > new Date(customer.last_order_at)) {
      customer.last_order_at = o.created_at;
    }
    if (!customer.last_activity || new Date(o.created_at) > new Date(customer.last_activity)) {
      customer.last_activity = o.created_at;
    }
  }

  // 2. Include registered profiles that have actual identity (email or name) even if 0 orders
  for (const p of profiles) {
    if (p.role === "admin") continue;
    const normEmail = p.email ? p.email.trim().toLowerCase() : "";
    if (!normEmail && !p.first_name && !p.last_name) {
      // Ignore empty anonymous placeholder profiles with 0 orders
      continue;
    }

    const key = normEmail || p.id;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: p.id,
        first_name: p.first_name ? p.first_name.trim() : "Registered",
        last_name: p.last_name ? p.last_name.trim() : "User",
        email: p.email ? p.email.trim() : "—",
        phone: p.phone ? p.phone.trim() : null,
        avatar_url: p.avatar_url ?? null,
        registration_date: p.created_at,
        last_activity: p.updated_at || p.created_at,
        orders_count: 0,
        total_spent: 0,
        last_order_at: null,
        is_registered: true,
        orders: [],
      });
    }
  }

  // 3. Format final customer records
  return Array.from(customerMap.values()).map((c) => {
    let segment: "new" | "returning" | "vip" = "new";
    if (c.total_spent >= 1000) {
      segment = "vip";
    } else if (c.orders_count >= 2) {
      segment = "returning";
    }

    const firstName = c.first_name ? c.first_name.trim() : "Guest Customer";
    const lastName = c.last_name ? c.last_name.trim() : "";

    return {
      id: c.id,
      first_name: firstName,
      last_name: lastName,
      email: c.email || "—",
      phone: c.phone,
      avatar_url: c.avatar_url,
      registration_date: c.registration_date,
      last_activity: c.last_activity,
      orders_count: c.orders_count,
      total_spent: c.total_spent,
      last_order_at: c.last_order_at,
      segment,
    };
  });
}

export function useCustomersManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  segment = "",
  activity = "",
) {
  const [result, setResult] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const allCustomers = await fetchAggregatedCustomers();

      let filtered = allCustomers;

      // 1. Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter((c) => {
          const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
          const email = (c.email ?? "").toLowerCase();
          return fullName.includes(q) || email.includes(q);
        });
      }

      // 2. Segment filter
      if (segment && segment !== "all") {
        filtered = filtered.filter((c) => c.segment === segment);
      }

      // 3. Activity filter
      if (activity && activity !== "all") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (activity === "active") {
          filtered = filtered.filter(
            (c) => c.last_activity && new Date(c.last_activity) >= thirtyDaysAgo,
          );
        } else if (activity === "inactive") {
          filtered = filtered.filter(
            (c) => !c.last_activity || new Date(c.last_activity) < thirtyDaysAgo,
          );
        }
      }

      // 4. Sorting
      filtered.sort((a, b) => {
        let valA: string | number = 0;
        let valB: string | number = 0;

        if (sortBy === "name") {
          valA = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim().toLowerCase();
          valB = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim().toLowerCase();
        } else if (sortBy === "orders_count") {
          valA = a.orders_count;
          valB = b.orders_count;
        } else if (sortBy === "total_spent") {
          valA = a.total_spent;
          valB = b.total_spent;
        } else if (sortBy === "last_activity") {
          valA = a.last_activity ? new Date(a.last_activity).getTime() : 0;
          valB = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        } else {
          // created_at / registration_date
          valA = a.registration_date ? new Date(a.registration_date).getTime() : 0;
          valB = b.registration_date ? new Date(b.registration_date).getTime() : 0;
        }

        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });

      const total = filtered.length;
      const offset = (page - 1) * pageSize;
      const paginated = filtered.slice(offset, offset + pageSize);

      setResult({ customers: paginated, total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, segment, activity]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export function useCustomerDetails(userId: string | null) {
  const [details, setDetails] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch profile if exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      // 2. Fetch orders matching user_id, order id, or profile email
      let ordersQuery = supabase.from("orders").select("*");
      if (profile?.email) {
        ordersQuery = ordersQuery.or(`user_id.eq.${userId},email.ilike.${profile.email.trim()}`);
      } else {
        ordersQuery = ordersQuery.or(`user_id.eq.${userId},id.eq.${userId}`);
      }

      const { data: orders } = await ordersQuery.order("created_at", { ascending: false });
      const allOrders = (orders ?? []) as RawOrder[];

      const primaryEmail = profile?.email || allOrders[0]?.email || "";

      const firstOrderShipping = allOrders[0]?.shipping_address as Record<string, any> | undefined;
      const firstOrderBilling = allOrders[0]?.billing_address as Record<string, any> | undefined;

      const firstName =
        profile?.first_name ||
        firstOrderShipping?.firstName ||
        firstOrderShipping?.first_name ||
        firstOrderBilling?.firstName ||
        firstOrderBilling?.first_name ||
        "Guest Customer";

      const lastName =
        profile?.last_name ||
        firstOrderShipping?.lastName ||
        firstOrderShipping?.last_name ||
        firstOrderBilling?.lastName ||
        firstOrderBilling?.last_name ||
        "";

      const phone =
        profile?.phone ||
        firstOrderShipping?.phone ||
        firstOrderBilling?.phone ||
        null;

      const ordersCount = allOrders.length;
      const totalSpent = allOrders
        .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
        .reduce((sum, o) => sum + Number(o.total ?? 0), 0);

      const avgOrderValue = ordersCount > 0 ? totalSpent / ordersCount : 0;
      const lastOrderAt = allOrders[0]?.created_at ?? null;

      let segment = "new";
      if (totalSpent >= 1000) {
        segment = "vip";
      } else if (ordersCount >= 2) {
        segment = "returning";
      }

      const recentOrders: CustomerOrder[] = allOrders.slice(0, 10).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        created_at: o.created_at,
        status: o.status,
        total: Number(o.total ?? 0),
      }));

      const addresses: CustomerAddress[] = [];
      if (profile?.id) {
        const { data: dbAddrs } = await supabase
          .from("customer_addresses")
          .select("*")
          .eq("user_id", profile.id);

        if (dbAddrs) {
          for (const a of dbAddrs) {
            addresses.push({
              id: a.id,
              label: a.label ?? null,
              line1: a.line1,
              line2: a.line2 ?? null,
              city: a.city,
              state: a.state ?? null,
              postal_code: a.postal_code,
              country: a.country,
              is_default: Boolean(a.is_default),
            });
          }
        }
      }

      if (addresses.length === 0 && firstOrderShipping?.line1) {
        addresses.push({
          id: "order-shipping",
          label: "Shipping Address",
          line1: firstOrderShipping.line1 || "",
          line2: firstOrderShipping.line2 || null,
          city: firstOrderShipping.city || "",
          state: firstOrderShipping.state || null,
          postal_code: firstOrderShipping.postalCode || firstOrderShipping.postal_code || "",
          country: firstOrderShipping.country || "",
          is_default: true,
        });
      }

      const customerDetails: CustomerDetails = {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email: primaryEmail || "—",
        phone,
        avatar_url: profile?.avatar_url ?? null,
        registration_date: profile?.created_at ?? null,
        last_activity: profile?.updated_at ?? allOrders[0]?.created_at ?? null,
        orders_count: ordersCount,
        total_spent: totalSpent,
        avg_order_value: avgOrderValue,
        last_order_at: lastOrderAt,
        segment,
        recent_orders: recentOrders,
        addresses,
      };

      setDetails(customerDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { details, loading, error, refetch: load };
}

export function useCustomersAnalytics() {
  const [analytics, setAnalytics] = useState<CustomersAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allCustomers = await fetchAggregatedCustomers();
      const stats: CustomersAnalytics = {
        totalCustomers: allCustomers.length,
        newCustomers: allCustomers.filter((c) => c.segment === "new").length,
        returningCustomers: allCustomers.filter((c) => c.segment === "returning").length,
        vipCustomers: allCustomers.filter((c) => c.segment === "vip").length,
      };
      setAnalytics(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { analytics, loading, error, refetch: load };
}
