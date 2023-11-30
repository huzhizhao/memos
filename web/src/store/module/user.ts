import { camelCase } from "lodash-es";
import { userServiceClient } from "@/grpcweb";
import * as api from "@/helpers/api";
import storage from "@/helpers/storage";
import { getSystemColorScheme } from "@/helpers/utils";
import { User as UserPb } from "@/types/proto/api/v2/user_service";
import store, { useAppSelector } from "..";
import { setAppearance, setLocale } from "../reducer/global";
import { patchUser, setHost, setUser } from "../reducer/user";

const defaultSetting: Setting = {
  locale: "en",
  appearance: getSystemColorScheme(),
  memoVisibility: "PRIVATE",
  telegramUserId: "",
};

const defaultLocalSetting: LocalSetting = {
  enableDoubleClickEditing: false,
};

export const convertResponseModelUser = (user: User): User => {
  // user default 'Basic Setting' should follow server's setting
  // 'Basic Setting' fields: locale, appearance
  const { systemStatus } = store.getState().global;
  const { locale, appearance } = systemStatus.customizedProfile;
  const systemSetting = { locale, appearance };

  const setting: Setting = {
    ...defaultSetting,
    ...systemSetting,
  };
  const { localSetting: storageLocalSetting } = storage.get(["localSetting"]);
  const localSetting: LocalSetting = {
    ...defaultLocalSetting,
    ...storageLocalSetting,
  };

  if (user.userSettingList) {
    for (const userSetting of user.userSettingList) {
      (setting as any)[camelCase(userSetting.key)] = JSON.parse(userSetting.value);
    }
  }

  return {
    ...user,
    setting,
    localSetting,
    createdTs: user.createdTs * 1000,
    updatedTs: user.updatedTs * 1000,
  };
};

export const initialUserState = async () => {
  const { systemStatus } = store.getState().global;

  if (systemStatus.host) {
    store.dispatch(setHost(convertResponseModelUser(systemStatus.host)));
  }

  const user = await fetchCurrentUser();
  if (user) {
    if (user.setting.locale) {
      store.dispatch(setLocale(user.setting.locale));
    }
    if (user.setting.appearance) {
      store.dispatch(setAppearance(user.setting.appearance));
    }
    return user;
  }
};

const doSignOut = async () => {
  await api.signout();
  localStorage.removeItem("userId");
};

const fetchCurrentUser = async () => {
  const userId = localStorage.getItem("userId");
  if (userId) {
    const { data } = await api.getUserById(Number(userId));
    const user = convertResponseModelUser(data);
    if (user) {
      store.dispatch(setUser(user));
      return user;
    }
  }
};

export const useUserStore = () => {
  const state = useAppSelector((state) => state.user);

  return {
    state,
    getState: () => {
      return store.getState().user;
    },
    doSignOut,
    fetchCurrentUser,
    setCurrentUser: async (user: User) => {
      localStorage.setItem("userId", String(user.id));
    },
    upsertUserSetting: async (key: string, value: any) => {
      await api.upsertUserSetting({
        key: key as any,
        value: JSON.stringify(value),
      });
      await fetchCurrentUser();
    },
    upsertLocalSetting: async (localSetting: LocalSetting) => {
      storage.set({ localSetting });
      store.dispatch(patchUser({ localSetting }));
    },
    patchUser: async (user: UserPb, updateMask: string[]): Promise<void> => {
      await userServiceClient.updateUser({ user, updateMask });
      // If the user is the current user and the username is changed, reload the page.
      if (user.id === store.getState().user.user?.id) {
        window.location.reload();
      }
    },
    deleteUser: async (name: string) => {
      await userServiceClient.deleteUser({
        name,
      });
    },
  };
};
