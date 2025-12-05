import { NavigateFunction } from "react-router-dom";

export type StudentMenuSection =
  | "dashboard"
  | "find-tutors"
  | "my-reservations"
  | "my-tasks"
  | "post-task";

export function studentMenuNavigate(navigate: NavigateFunction, section: StudentMenuSection) {
  switch (section) {
    case "dashboard":
      navigate("/student-dashboard");
      break;
    case "find-tutors":
      navigate("/student-finds-tutors");        
      break;
    case "my-reservations":
      navigate("/student-reservations");       
      break;
    case "my-tasks":
      navigate("/student-dashboard?section=my-tasks");
      break;
    case "post-task":
      navigate("/student-dashboard?section=post-task");
      break;
  }
}
