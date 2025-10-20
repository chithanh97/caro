import { API_URL } from "./config";
export const fetchRooms = () => fetch(`${API_URL}/api/rooms`).then(r => r.json());

// axios
import axios from "axios";
export const api = axios.create({ baseURL: API_URL });