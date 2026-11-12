-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · seed — generated from the POC (apps/student/src). Safe to run once on a new project.
-- ════════════════════════════════════════════════════════════════════

-- Plans (prices in paise)
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('starter', 'Starter', 79900, 767000, 50, 5, 10, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace']::text[], false, 'Individual tutors and small cohorts', 0);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('creator', 'Creator', 149900, 1439000, 150, 20, 30, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons']::text[], false, 'Growing educators and course creators', 1);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('growth', 'Growth', 349900, 3359000, 500, 50, 100, 5, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports']::text[], true, 'Established educators and academies', 2);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('institute', 'Institute', 799900, 7679000, 1500, 150, 250, 25, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Larger institutes and multi-tutor teams', 3);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('enterprise', 'Enterprise', null, null, null, null, null, null, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Large or specialized deployments', 4);

-- Add-ons
insert into public.addons (kind, label, unit, monthly_paise, adds_students) values ('students', 'Student block', '+250 active students', 99900, 250);
insert into public.addons (kind, label, unit, monthly_paise, adds_storage_gb) values ('storage', 'Video storage', '+25 GB', 49900, 25);
insert into public.addons (kind, label, unit, monthly_paise, adds_live_hours) values ('live_hours', 'Live room-hours', '+20 hours / month', 69900, 20);
insert into public.addons (kind, label, unit, monthly_paise, adds_seats) values ('seats', 'Tutor seats', '+5 seats', 149900, 5);
insert into public.addons (kind, label, unit, monthly_paise, adds_feature) values ('custom_domain', 'Custom domain', 'your own domain + SSL', 49900, 'custom_domain');

-- Staff permissions
insert into public.role_perms (role, perm) values ('super_admin', 'overview');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.educators');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.courses');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.reports');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.view');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'plans.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'config.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'money.view');
insert into public.role_perms (role, perm) values ('super_admin', 'payouts.run');
insert into public.role_perms (role, perm) values ('super_admin', 'refunds');
insert into public.role_perms (role, perm) values ('super_admin', 'content.bodhin');
insert into public.role_perms (role, perm) values ('super_admin', 'users.view');
insert into public.role_perms (role, perm) values ('super_admin', 'users.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'support.tickets');
insert into public.role_perms (role, perm) values ('super_admin', 'broadcast');
insert into public.role_perms (role, perm) values ('super_admin', 'admins.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'audit.view');
insert into public.role_perms (role, perm) values ('finance', 'overview');
insert into public.role_perms (role, perm) values ('finance', 'tenants.view');
insert into public.role_perms (role, perm) values ('finance', 'money.view');
insert into public.role_perms (role, perm) values ('finance', 'payouts.run');
insert into public.role_perms (role, perm) values ('finance', 'refunds');
insert into public.role_perms (role, perm) values ('finance', 'audit.view');
insert into public.role_perms (role, perm) values ('moderator', 'overview');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.educators');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.courses');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.reports');
insert into public.role_perms (role, perm) values ('moderator', 'tenants.view');
insert into public.role_perms (role, perm) values ('moderator', 'content.bodhin');
insert into public.role_perms (role, perm) values ('support', 'overview');
insert into public.role_perms (role, perm) values ('support', 'tenants.view');
insert into public.role_perms (role, perm) values ('support', 'users.view');
insert into public.role_perms (role, perm) values ('support', 'users.manage');
insert into public.role_perms (role, perm) values ('support', 'support.tickets');

-- Reserved web addresses
insert into public.reserved_slugs (slug) values ('www'), ('app'), ('admin'), ('api'), ('mail'), ('help'), ('support'), ('blog'), ('bodhin'), ('static'), ('cdn'), ('status'), ('docs'), ('pay'), ('learn');

-- Categories
insert into public.categories (id, name, icon, sort) values ('all', 'All Courses', 'apps', 0);
insert into public.categories (id, name, icon, sort) values ('marketing', 'Marketing', 'megaphone', 1);
insert into public.categories (id, name, icon, sort) values ('ai-data', 'AI & Data', 'hardware-chip', 2);
insert into public.categories (id, name, icon, sort) values ('development', 'Development', 'code-slash', 3);
insert into public.categories (id, name, icon, sort) values ('design', 'Design', 'color-palette', 4);
insert into public.categories (id, name, icon, sort) values ('business', 'Business', 'briefcase', 5);

-- Bodhin itself is a workspace (its own courses: 100% to Bodhin)
insert into public.tenants (id, slug, display_name, tagline, primary_color, primary_deep, accent, hide_powered_by) values (md5('t_bodhin')::uuid, 'learn', 'Bodhin', 'Learn from India''s best educators', '#0F3D63', '#0A2A45', '#F2A93B', true);
insert into public.tenant_subscriptions (tenant_id, plan, status, period_end) values (md5('t_bodhin')::uuid, 'enterprise', 'active', '2099-12-31');
insert into public.tenant_payment_settings (tenant_id, direct_gateway_status) values (md5('t_bodhin')::uuid, 'active');
insert into public.tenant_usage (tenant_id) values (md5('t_bodhin')::uuid);
insert into public.platform_config (id, bodhin_tenant_id) values (1, md5('t_bodhin')::uuid);
insert into public.feature_flags (id) values (1);

-- Bodhin promo codes (valid only on Bodhin courses)
insert into public.coupons (tenant_id, code, type, value, ends_at) values (md5('t_bodhin')::uuid, 'BODHIN10', 'pct', 10, now() + interval '1 year'), (md5('t_bodhin')::uuid, 'WELCOME5', 'pct', 5, now() + interval '1 year');

-- Bodhin's own courses (demo content; videos are added later through the course builder)
insert into public.courses (id, tenant_id, title, subtitle, description, category_id, collections, level, format, language, price_paise, compare_at_paise, access_months, certificate, outcomes, art, status, visibility, moderation, published_at) values (md5('c_career')::uuid, md5('t_bodhin')::uuid, 'Career Launchpad: Communication & Interviews', 'Bodhin’s own program to get interview-ready in four weeks.', 'Resume, LinkedIn, spoken English for interviews and mock interviews with feedback. Built and taught by the Bodhin team.', 'business', array['career','job-ready']::text[], 'beginner', 'hybrid', 'English', 299900, null, null, true, array['ATS-friendly resume','LinkedIn profile that gets calls','Confident self-introduction','Answering HR & technical rounds']::text[], '{"from":"#0B3B73","to":"#D99A1E","icon":"briefcase"}'::jsonb, 'published', 'public_promoted', 'approved', now());
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn', 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l1')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn: overview', 'video', 720, null, true, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l2')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn in practice', 'video', 1080, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l3')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1320, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l4')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics', 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l1')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics: overview', 'video', 900, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l2')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics in practice', 'video', 1200, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l3')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1380, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l4')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds', 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l1')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds: overview', 'video', 1080, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l2')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds in practice', 'video', 1320, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l3')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1440, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l4')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews', 3);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l1')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews: overview', 'video', 1260, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l2')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews in practice', 'video', 1440, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l3')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1500, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l4')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews quiz', 'quiz', null, null, false, null, 3);
