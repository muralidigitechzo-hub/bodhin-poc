/** Admin › Courses: Bodhin's own courses (100% to Bodhin), matching Educator › Courses layout. */
import React from 'react';
import { CoursesManager } from '@/ui/CoursesManager';

export default function AdminCourses() {
  return <CoursesManager mode="admin" />;
}
