import { doc, getDoc, updateDoc, addDoc, collection, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { updateSeatStatus } from './seatApi';
import { addLog } from './logger';

// 1. 예약/취소/퇴실 통합 액션 함수
// 🚨 파라미터에 hours를 추가로 받고, 내부에서 arguments를 지웁니다!
export const handleLibraryAction = async ({
  actionType, seat, user, isAdmin, isExamPeriod, now, reminderMinutes,
  setSelectedSeat, setShowCancelWarning, setCancelWarningData, loadUsers,
  hours, setShowSeatQR // 👈 1. 여기에 hours 추가!
}) => {
  let studentNo = user?.email?.split('@')[0];
  let currentUserName = "";

  if (studentNo) {
    const userDoc = await getDoc(doc(db, "User", studentNo));
    if (userDoc.exists()) currentUserName = userDoc.data().name;
  }

  // [A] 예약하기 (RESERVED)
  if (actionType === 'RESERVED') {
    const finalHours = hours || 1; // 👈 2. arguments[0].hours 대신 이렇게 수정!
    
    if (!window.confirm("예약을 확정하겠습니까?")) return;

    if (isExamPeriod && !isAdmin && !/^\d{7}$/.test(studentNo)) {
      alert("🚨 [출입 제한] 시험 기간에는 재학생(학번 7자리)만 예약할 수 있습니다.");
      return;
    }

    if (studentNo) {
      const userSnap = await getDoc(doc(db, "User", studentNo));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.penaltyUntil && !isAdmin) {
          const penaltyEnd = data.penaltyUntil.toDate ? data.penaltyUntil.toDate() : new Date(data.penaltyUntil);
          if (now < penaltyEnd) {
            alert(`🚨 예약 정지 상태입니다!\n${penaltyEnd.toLocaleString()}까지 불가능합니다.`);
            return;
          }
        }
      }
    }

    await updateSeatStatus(seat.id, 'RESERVED', user?.email, finalHours, currentUserName, reminderMinutes);
    alert(`⏱️ ${finalHours}시간 예약이 완료되었습니다.`);
    addLog(studentNo, 'RESERVE', 'SUCCESS', seat.id);
  }
  
  // ... (이 아래의 [B] 예약 취소 로직 등은 기존과 동일하게 두시면 됩니다)

  // [B] 예약 취소 (AVAILABLE)
  else if (actionType === 'CANCEL') {
    if (isAdmin) {
      if (!window.confirm("관리자 권한으로 취소하시겠습니까? (패널티 면제)")) return;
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      alert("✅ 예약이 취소되었습니다.");
    } else {
      const targetUserRef = doc(db, "User", studentNo);
      const targetUserSnap = await getDoc(targetUserRef);

      if (targetUserSnap.exists()) {
        let data = targetUserSnap.data();
        let cancelCount = (data.cancelCount || 0) + 1;
        let penaltyCount = data.penaltyCount || 0;
        let updates = { cancelCount: cancelCount };

        if (cancelCount >= 3) {
          penaltyCount += 1;
          updates.penaltyCount = penaltyCount;
          updates.cancelCount = 0;
          let penaltyTime = new Date(now);
          if (penaltyCount <= 3) penaltyTime.setHours(penaltyTime.getHours() + 2);
          else if (penaltyCount === 4) penaltyTime.setDate(penaltyTime.getDate() + 3);
          else penaltyTime.setDate(penaltyTime.getDate() + 30);
          updates.penaltyUntil = penaltyTime;
          alert(`🚨 누적 취소 3회! 예약 정지 패널티가 부여되었습니다.`);
        } else {
          alert(`✅ 예약 취소 완료 (누적 취소: ${cancelCount}회)`);
        }
        await updateDoc(targetUserRef, updates);
        await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      }
    }
  }

  // [C] 퇴실 및 반납 (AVAILABLE)
  else if (actionType === 'RETURN') {
    if (!window.confirm("퇴실하시겠습니까?")) return;
    const startedAt = seat.startedAt?.toDate ? seat.startedAt.toDate() : new Date(seat.startedAt || now);
    const usedMins = Math.max(1, Math.ceil((now - startedAt) / 60000));

    await updateDoc(doc(db, "User", studentNo), {
      totalUsageCount: increment(1),
      totalUsageTime: increment(usedMins)
    });
    await addDoc(collection(db, "Log"), {
      action: "COMPLETED", studentNo, seatId: seat.id, usedMins, createdAt: serverTimestamp()
    });
    await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
    alert(`퇴실 완료 (${usedMins}분 이용)`);
  }

  // [D] 관리자 전용: 좌석 비활성화 (DISABLED)
  else if (actionType === 'DISABLE') {
    if (!window.confirm("좌석을 비활성화하시겠습니까?")) return;
    await updateSeatStatus(seat.id, 'DISABLED', null, 0, null, 20);
    alert("좌석이 비활성화되었습니다.");
  }
  // 🚨 [여기에 추가!] 
    // [E] 착석 인증 (RESERVED -> OCCUPIED)
    else if (actionType === 'OCCUPY') {
      const finalHours = seat.reservedHours || 1; // 기존 예약했던 시간 유지
      await updateSeatStatus(seat.id, 'OCCUPIED', user?.email, finalHours, currentUserName, reminderMinutes);
      alert("✅ 착석 인증이 완료되었습니다. (사용 중)");
    }

    // 🚨 [여기에 추가!] 
    // [F] 비활성화 해제 (DISABLED -> AVAILABLE)
    else if (actionType === 'ENABLE') {
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      alert("✅ 자리가 활성화되었습니다.");
    }

    // 🧹 팝업 및 모달 닫기 (자동으로 배치도 화면으로 돌아갑니다!)
    if (setSelectedSeat) setSelectedSeat(null);
    if (setShowCancelWarning) setShowCancelWarning(false);
    if (setShowSeatQR) setShowSeatQR(false); // QR 코드 창 강제 닫기
    if (loadUsers) loadUsers();
  };

// 2. 시간 표시 유틸리티
export const calculateElapsedTime = (startedAt, now) => {
  if (!startedAt) return "00:00:00";
  const startTime = startedAt.toDate ? startedAt.toDate() : new Date(startedAt);
  const diffInMs = now - startTime;
  if (diffInMs < 0) return "00:00:00";
  const totalSeconds = Math.floor(diffInMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const format = (num) => String(num).padStart(2, '0');
  return `${format(h)}:${format(m)}:${format(s)}`;
};