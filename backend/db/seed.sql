-- Categories
INSERT INTO job_categories (category_name) VALUES
('Food & Beverage'), ('Retail'), ('Events'), ('Delivery'),
('Technology'), ('Healthcare'), ('Education'), ('Hospitality');

-- Users (password is 'password123' — hashed via bcrypt in init.js)
-- Placeholder hashes will be replaced by init.js
INSERT INTO users (name, email, password, phone, role, location) VALUES
('Adwaith Naveen', 'adwaith@gmail.com', '$PLACEHOLDER$', '9876543210', 'employee', 'Kochi, Kerala'),
('Tech Solutions Inc.', 'employer@techsolutions.com', '$PLACEHOLDER$', '9876543211', 'employer', 'Kochi, Kerala'),
('FreshBites Cafe', 'info@freshbites.com', '$PLACEHOLDER$', '9876543212', 'employer', 'Kochi, Kerala'),
('Anoop Krishna', 'anoop@gmail.com', '$PLACEHOLDER$', '9876543213', 'employee', 'Thrissur, Kerala'),
('Sarah John', 'sarah@gmail.com', '$PLACEHOLDER$', '9876543214', 'employee', 'Kochi, Kerala'),
('Rahul P', 'rahul@gmail.com', '$PLACEHOLDER$', '9876543215', 'employee', 'Ernakulam, Kerala'),
('Meera T', 'meera@gmail.com', '$PLACEHOLDER$', '9876543216', 'employee', 'Kochi, Kerala'),
('Quick Delivery Co.', 'hr@quickdelivery.com', '$PLACEHOLDER$', '9876543217', 'employer', 'Trivandrum, Kerala');

-- User Roles (one row per user-role mapping)
INSERT INTO user_roles (user_id, role) VALUES
(1, 'employee'),
(2, 'employer'),
(3, 'employer'),
(4, 'employee'),
(5, 'employee'),
(6, 'employee'),
(7, 'employee'),
(8, 'employer');

-- Employer Profiles
INSERT INTO employer_profiles (user_id, company_name, company_description, company_location, company_website, industry) VALUES
(2, 'Tech Solutions Inc.', 'Leading technology company specializing in software development and IT solutions.', 'Kochi, Kerala', 'www.techsolutions.com', 'Technology'),
(3, 'FreshBites Cafe', 'Popular local cafe chain known for fresh food and great service.', 'Kochi, Kerala', 'www.freshbites.com', 'Food & Beverage'),
(8, 'Quick Delivery Co.', 'Fast and reliable delivery service operating across Kerala.', 'Trivandrum, Kerala', 'www.quickdelivery.com', 'Delivery');

-- Employee Profiles
INSERT INTO employee_profiles (user_id, skills, experience, education, resume_url, availability) VALUES
(1, 'Communication, Time Management, Customer Service', 1, 'BSc Computer Science', '', 'weekends'),
(4, 'React, JavaScript, Node.js', 2, 'BTech IT', '', 'weekdays'),
(5, 'UI/UX Design, Figma, Adobe XD', 3, 'BDes', '', 'both'),
(6, 'Python, Data Entry, Excel', 1, 'BCA', '', 'weekdays'),
(7, 'Content Writing, SEO, Marketing', 2, 'BA English', '', 'weekends');

-- Jobs
INSERT INTO jobs (employer_id, title, description, location, salary, job_type, skills_required) VALUES
(3, 'Restaurant Helper', 'Assisting kitchen staff, maintaining cleanliness, and helping with food preparation.', 'Kochi, Kerala', 700.00, 'part-time', 'Communication, Customer Service'),
(2, 'React Developer Intern', 'Join our tech team. Work on real-world projects and learn best practices.', 'Kochi, Kerala', 1500.00, 'part-time', 'React, JavaScript'),
(2, 'UI/UX Designer', 'Creative UI/UX Designer needed for web apps. Figma experience is a plus.', 'Kochi, Kerala', 1200.00, 'contract', 'Figma, UI/UX Design'),
(8, 'Delivery Assistant', 'Looking for energetic individuals to assist with parcel deliveries across the city.', 'Trivandrum, Kerala', 500.00, 'freelance', 'Driving, Time Management'),
(3, 'Event Staff', 'Required for a weekend food festival event. Duties include setup and serving.', 'Kochi, Kerala', 900.00, 'part-time', 'Communication'),
(2, 'Python Intern', 'Looking for a Python enthusiast to help with backend development scripts.', 'Kochi, Kerala', 1200.00, 'internship', 'Python'),
(8, 'Store Helper', 'Assist with stocking shelves, inventory management, and customer service.', 'Trivandrum, Kerala', 600.00, 'part-time', 'Customer Service'),
(2, 'Content Writer', 'Create engaging blog posts and marketing copy for technology products.', 'Remote', 800.00, 'part-time', 'Content Writing, SEO');

-- Job Category Mapping
INSERT INTO job_category_mapping (job_id, category_id) VALUES
(1, 1), (2, 5), (3, 5), (4, 4), (5, 3), (6, 5), (7, 2), (8, 5);

-- Applications
INSERT INTO applications (job_id, employee_id, status) VALUES
(1, 1, 'accepted'),
(2, 4, 'accepted'),
(3, 5, 'accepted'),
(4, 1, 'pending'),
(5, 1, 'rejected'),
(6, 6, 'accepted'),
(8, 7, 'accepted'),
(2, 1, 'pending'),
(7, 4, 'rejected');

-- Saved Jobs
INSERT INTO saved_jobs (employee_id, job_id) VALUES
(1, 2), (1, 3), (4, 6), (5, 2);

-- Reviews
INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES
(1, 1, 3, 5, 'Great experience working here!'),
(1, 3, 1, 5, 'Adwaith was hardworking and reliable.'),
(2, 4, 2, 4, 'Good learning environment.'),
(2, 2, 4, 5, 'Excellent developer.'),
(3, 5, 2, 5, 'Wonderful company.');

-- Job History
INSERT INTO job_history (job_id, employee_id, start_date, end_date, status) VALUES
(5, 1, '2026-02-01', '2026-02-02', 'completed'),
(3, 5, '2026-01-15', '2026-03-01', 'completed');

-- Employee Skills
INSERT INTO employee_skills (employee_id, skill_name) VALUES
(1, 'Communication'), (1, 'Time Management'), (4, 'React'), (4, 'JavaScript'),
(5, 'UI/UX Design'), (5, 'Figma'), (6, 'Python'), (7, 'Content Writing');

-- Employer Ratings
INSERT INTO employer_ratings (employer_id, employee_id, rating, review) VALUES
(2, 4, 4, 'Good employer overall.'),
(3, 1, 5, 'Very supportive management.');

-- Employee Ratings
INSERT INTO employee_ratings (employee_id, employer_id, rating, review) VALUES
(1, 3, 5, 'Great worker.'),
(4, 2, 5, 'Fast learner.');

-- Notifications
INSERT INTO notifications (user_id, message, is_read) VALUES
(1, 'Your application for Restaurant Helper was accepted.', FALSE),
(2, 'You have a new application for React Developer Intern.', FALSE),
(1, 'You have a new review from FreshBites Cafe.', TRUE);

-- Recommendations
INSERT INTO recommendations (employee_id, job_id, score) VALUES
(1, 4, 0.85),
(1, 5, 0.75),
(4, 6, 0.90),
(5, 2, 0.60);
